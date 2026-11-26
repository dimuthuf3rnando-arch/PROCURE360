from datetime import UTC, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.errors import ForbiddenError, NotFoundError, StaleVersionError, ValidationError
from app.models.contract import Contract
from app.models.enums import AuditAction, ContractStatus, HandoffAction, UserRole
from app.models.user import User
from app.services.audit import add_action_audit, add_handoff
from app.services.notifications import notify_role, notify_users
from app.services.contract_fields import (
    FIELD_LABELS,
    NEXT_STAGE,
    PREVIOUS_ROLE,
    QS_FORWARD_TARGETS,
    REQUIRED_TO_COMPLETE,
    REQUIRED_TO_FORWARD,
    SECTION_FIELDS,
    STATUS_LABELS,
)
from app.services.validators import ensure_required

NUMERIC_FIELDS = {"awarded_amount_without_vat", "p_bond_amount_lkr"}


def get_contract_or_404(db: Session, contract_id: int) -> Contract:
    contract = db.get(Contract, contract_id)
    if contract is None:
        raise NotFoundError(f"Contract #{contract_id} was not found.")
    return contract


def normalize_value(field: str, value: Any) -> Any:
    if field in {"bec_member_ids", "doc_evaluation_member_ids"}:
        return sorted(set(int(v) for v in (value or [])))
    if isinstance(value, str):
        cleaned = value.strip()
        return cleaned or None
    if field in NUMERIC_FIELDS and value is not None:
        return Decimal(str(value)).quantize(Decimal("0.01"))
    return value


def change_flags(field: str) -> bool:
    return field in {"tender_docs_sent", "bid_bond_released"}


def editable_sections(user: User, contract: Contract) -> list[str]:
    if user.role == UserRole.ADMIN:
        return ["PC_MANAGER", "QS", "PC_ENGINEER"]
    if user.role == UserRole.VIEWER or contract.status == ContractStatus.COMPLETED:
        return []
    if contract.current_owner_role == user.role and user.role in SECTION_FIELDS:
        # Supply Officer shares the engineer's section and field set.
        section = "PC_ENGINEER" if user.role == UserRole.SUPPLY_OFFICER else user.role.value
        return [section]
    return []


def editable_fields(user: User, contract: Contract) -> list[str]:
    sections = editable_sections(user, contract)
    fields: list[str] = []
    for section in sections:
        fields.extend(SECTION_FIELDS[UserRole(section)])
    return fields


def available_actions(user: User, contract: Contract) -> list[str]:
    if user.role == UserRole.VIEWER:
        return []
    if contract.status == ContractStatus.COMPLETED:
        return ["EDIT"] if user.role == UserRole.ADMIN else []

    is_owner = contract.current_owner_role == user.role
    is_admin = user.role == UserRole.ADMIN

    actions: list[str] = []
    if is_owner or is_admin:
        actions.append("EDIT")
        actions.append("FORWARD")
        if (
            contract.current_owner_role in PREVIOUS_ROLE
            and contract.status != ContractStatus.RETURNED_FOR_CORRECTION
        ):
            actions.append("RETURN")
        if contract.current_owner_role in (UserRole.PC_ENGINEER, UserRole.SUPPLY_OFFICER):
            actions.append("COMPLETE")
    return actions


def assert_edit_allowed(
    user: User,
    contract: Contract,
    changed_fields: list[str],
    *,
    admin_override: bool,
    override_reason: str | None,
) -> None:
    if not changed_fields:
        return
    if user.role == UserRole.ADMIN:
        if not admin_override or not (override_reason or "").strip():
            raise ForbiddenError(
                "Administrator edits require override mode and a written reason. "
                "Every override is recorded in the audit trail.",
                code="admin_override_required",
            )
        return
    if user.role == UserRole.VIEWER:
        raise ForbiddenError("Viewer accounts have read-only access.")
    if contract.status == ContractStatus.COMPLETED:
        raise ForbiddenError("This contract is completed. Only an administrator override can change it.")
    if contract.current_owner_role != user.role:
        raise ForbiddenError(
            f"This record is currently with {contract.current_owner_role.value.replace('_', ' ')}. "
            "Only the current owner can edit their section.",
            code="not_current_owner",
        )
    allowed = set(SECTION_FIELDS.get(user.role, []))
    disallowed = [field for field in changed_fields if field not in allowed]
    if disallowed:
        labels = ", ".join(FIELD_LABELS.get(field, field) for field in disallowed)
        raise ForbiddenError(
            f"Your section does not own these fields while the record is at this stage: {labels}.",
            code="field_locked",
        )


def _action_target(
    contract: Contract,
    action: str,
    target_role: UserRole | None = None,
) -> tuple[ContractStatus, UserRole, HandoffAction]:
    owner = contract.current_owner_role
    if action == "forward":
        if owner == UserRole.QS:
            chosen = target_role or UserRole.PC_ENGINEER
            target = QS_FORWARD_TARGETS.get(chosen)
            if target is None:
                raise ValidationError(
                    "A QS can forward only to the P&C Engineer or the Supply Officer."
                )
            target_status, target_role = target
        else:
            default_status, default_role = NEXT_STAGE[owner]
            if target_role is not None and target_role != default_role:
                raise ValidationError(
                    "This stage has a fixed next owner and cannot choose a different recipient."
                )
            target_status, target_role = default_status, default_role
        handoff_action = (
            HandoffAction.COMPLETE if target_status == ContractStatus.COMPLETED else HandoffAction.FORWARD
        )
        return target_status, target_role, handoff_action
    if action == "complete":
        if owner not in (UserRole.PC_ENGINEER, UserRole.SUPPLY_OFFICER):
            raise ValidationError("Only the P&C Engineer or Supply Officer stage can be marked completed.")
        return ContractStatus.COMPLETED, owner, HandoffAction.COMPLETE
    if action == "return":
        previous = PREVIOUS_ROLE.get(owner)
        if previous is None:
            raise ValidationError("This stage has no previous stage to return the record to.")
        return ContractStatus.RETURNED_FOR_CORRECTION, previous, HandoffAction.RETURN_TO_PREVIOUS
    raise ValidationError(f"Unknown workflow action: {action}")


def assert_action_allowed(
    user: User,
    contract: Contract,
    action: str,
    *,
    admin_override: bool,
    override_reason: str | None,
    reason: str | None,
) -> None:
    if contract.status == ContractStatus.COMPLETED:
        raise ForbiddenError("Completed contracts cannot be moved. Use an audited administrator edit for corrections.")
    if user.role == UserRole.VIEWER:
        raise ForbiddenError("Viewer accounts have read-only access.")
    if user.role == UserRole.ADMIN:
        if not admin_override or not (override_reason or "").strip():
            raise ForbiddenError(
                "Administrator workflow actions require override mode and a written reason.",
                code="admin_override_required",
            )
    else:
        if contract.current_owner_role != user.role:
            raise ForbiddenError(
                f"This record is currently with {contract.current_owner_role.value.replace('_', ' ')}.",
                code="not_current_owner",
            )
        if action == "return" and contract.status == ContractStatus.RETURNED_FOR_CORRECTION:
            raise ValidationError(
                "A returned record must be corrected and forwarded. It cannot be returned again from the same stage."
            )
    if action == "return" and not (reason or "").strip():
        raise ValidationError("A written correction reason is mandatory when returning a record.")


def perform_transition(
    db: Session,
    contract_id: int,
    user: User,
    *,
    action: str,
    expected_version: int,
    reason: str | None = None,
    admin_override: bool = False,
    override_reason: str | None = None,
    target_role: UserRole | None = None,
) -> tuple[Contract, str]:
    contract = get_contract_or_404(db, contract_id)
    if contract.version != expected_version:
        raise StaleVersionError(contract.version)

    assert_action_allowed(
        user,
        contract,
        action,
        admin_override=admin_override,
        override_reason=override_reason,
        reason=reason,
    )

    owner = contract.current_owner_role
    target_status, target_role, handoff_action = _action_target(contract, action, target_role)

    if action == "forward" and target_status != ContractStatus.COMPLETED:
        ensure_required(
            contract,
            REQUIRED_TO_FORWARD[owner],
            f"Forwarding from {STATUS_LABELS[contract.status]}",
        )
    if target_status == ContractStatus.COMPLETED:
        ensure_required(contract, REQUIRED_TO_COMPLETE, "Completion")

    effective_reason = (override_reason if admin_override else reason) or reason
    if action == "return":
        effective_reason = (reason or "").strip()

    now = datetime.now(UTC)
    from_status = contract.status.value
    values: dict[str, Any] = {
        "status": target_status,
        "current_owner_role": target_role,
        "version": Contract.version + 1,
        "updated_at": now,
        "updated_by_id": user.id,
        "return_reason": None,
        "returned_from_role": None,
    }
    if target_status == ContractStatus.RETURNED_FOR_CORRECTION:
        values["return_reason"] = (reason or "").strip()
        values["returned_from_role"] = owner
    if target_status == ContractStatus.COMPLETED:
        values["completed_at"] = now

    result = db.execute(
        update(Contract)
        .where(Contract.id == contract_id, Contract.version == expected_version)
        .values(**values)
    )
    if result.rowcount == 0:
        db.rollback()
        fresh = db.get(Contract, contract_id)
        raise StaleVersionError(fresh.version if fresh else None)

    audit_action = {
        "return": AuditAction.RETURN,
        "complete": AuditAction.COMPLETE,
    }.get(action, AuditAction.TRANSITION)
    if admin_override:
        audit_action = AuditAction.ADMIN_OVERRIDE

    add_handoff(
        db,
        contract,
        user,
        action=handoff_action,
        from_status=from_status,
        to_status=target_status.value,
        from_role=owner.value,
        to_role=target_role.value,
        reason=effective_reason,
        version_after=expected_version + 1,
        admin_override=admin_override,
    )
    add_action_audit(
        db,
        contract,
        user,
        action=audit_action,
        field_name="status",
        old_value=from_status,
        new_value=target_status.value,
        reason=effective_reason,
        admin_override=admin_override,
    )
    add_action_audit(
        db,
        contract,
        user,
        action=audit_action,
        field_name="current_owner_role",
        old_value=owner.value,
        new_value=target_role.value,
        reason=effective_reason,
        admin_override=admin_override,
    )
    label = contract.project_name or contract.contract_no or f"Contract #{contract_id}"
    role_display = {
        UserRole.QS: "QS",
        UserRole.PC_MANAGER: "P&C Manager",
        UserRole.PC_ENGINEER: "P&C Engineer",
        UserRole.SUPPLY_OFFICER: "Supply Officer",
        UserRole.ADMIN: "Administrator",
        UserRole.VIEWER: "Viewer",
    }
    receiver = role_display.get(target_role, target_role.value.replace("_", " ").title())
    if action == "return":
        kind = "return"
        title = f"Returned for correction · {label}"
        body = (
            f"{user.full_name} returned this file to "
            f"{receiver} for correction."
            + (f" Reason: {effective_reason}" if effective_reason else "")
        )
    elif target_status == ContractStatus.COMPLETED:
        kind = "complete"
        title = f"Completed · {label}"
        body = f"{user.full_name} marked this record as completed."
    else:
        kind = "forward"
        title = f"Forwarded to {receiver} · {label}"
        body = f"{user.full_name} forwarded this file for the next section." + (
            f" Note: {effective_reason}" if effective_reason else ""
        )

    # Sender confirmation.
    notify_users(
        db,
        [user.id],
        kind="confirmation",
        title=f"You {kind} this record",
        body=title,
        contract_id=contract_id,
        actor_id=user.id,
    )
    # Receiver action notification, dedicated to the receiving role.
    notify_role(
        db,
        target_role,
        kind=kind,
        title=title,
        body=body,
        contract_id=contract_id,
        actor_id=user.id,
        exclude_user_ids=[user.id],
    )

    db.commit()
    db.expire_all()
    refreshed = get_contract_or_404(db, contract_id)

    if action == "return":
        message = f"Returned to {receiver} for correction."
    elif target_status == ContractStatus.COMPLETED:
        message = "Contract marked as completed."
    else:
        message = f"Forwarded to {receiver}."
    if admin_override:
        message += " Administrator override recorded."
    return refreshed, message


def apply_patch_values(
    contract: Contract,
    values: dict[str, Any],
) -> list[tuple[str, Any, Any]]:
    """Compare incoming values with the ORM object and return changed fields."""
    changes: list[tuple[str, Any, Any]] = []
    for field, raw_value in values.items():
        new_value = normalize_value(field, raw_value)
        if field in {"bec_member_ids", "doc_evaluation_member_ids"}:
            relationship = (
                contract.bec_members
                if field == "bec_member_ids"
                else contract.doc_evaluation_members
            )
            old_value = sorted(member.id for member in relationship)
            if old_value != new_value:
                changes.append((field, old_value, new_value))
            continue
        old_value = getattr(contract, field)
        compare_old = old_value
        if field in NUMERIC_FIELDS and old_value is not None:
            compare_old = Decimal(str(old_value)).quantize(Decimal("0.01"))
        if compare_old != new_value:
            changes.append((field, old_value, new_value))
    return changes

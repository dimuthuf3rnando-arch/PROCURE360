from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import delete, func, insert, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.errors import ForbiddenError, NotFoundError, StaleVersionError, ValidationError
from app.models.audit import AuditLog, ContractHandoff
from app.models.contract import (
    MEMBER_TABLE_FIELDS,
    Contract,
    contract_bec_members,
)
from app.models.contractor import Contractor
from app.models.enums import (
    AuditAction,
    ContractStatus,
    HandoffAction,
    LookupType,
    UserRole,
)
from app.models.master import EvaluationTeamMember, LookupValue
from app.models.user import User
from app.schemas.contract import ContractCreate, ContractListItem, ContractOut, ContractUpdate
from app.services.audit import add_action_audit, add_field_audits, add_handoff
from app.services.notifications import notify_role, notify_users
from app.services.contract_fields import (
    ALL_CONTRACT_FIELDS,
    FIELD_LABELS,
    FIELD_META,
    REQUIRED_FOR_CREATE,
    SECTION_FIELDS,
    STATUS_LABELS,
)
from app.services.validators import (
    compute_warnings,
    effective_completion_date,
    ensure_required,
    is_overdue,
)

MEMBER_RELATIONSHIPS = {
    "bec_member_ids": "bec_members",
    "doc_evaluation_member_ids": "doc_evaluation_members",
}
from app.services.workflow import (
    assert_edit_allowed,
    available_actions,
    change_flags,
    editable_fields,
    editable_sections,
    get_contract_or_404,
    normalize_value,
)

LOOKUP_FIELD_MAP = {
    "category": LookupType.CATEGORY,
    "priority": LookupType.PRIORITY,
    "procurement_method": LookupType.PROCUREMENT_METHOD,
    "office_region": LookupType.OFFICE_REGION,
    "funds": LookupType.FUNDS,
}


# ─────────────────────────────────────────────────────────────────────────────
# Serialization
# ─────────────────────────────────────────────────────────────────────────────
def serialize_contract(contract: Contract, user: User) -> ContractOut:
    out = ContractOut.model_validate(contract)
    out.bec_member_ids = sorted(member.id for member in contract.bec_members)
    out.doc_evaluation_member_ids = sorted(
        member.id for member in contract.doc_evaluation_members
    )
    out.warnings = compute_warnings(contract)
    out.editable_fields = editable_fields(user, contract)
    out.editable_sections = editable_sections(user, contract)
    out.available_actions = available_actions(user, contract)
    out.assigned_to_me = contract.current_owner_role == user.role and contract.status != ContractStatus.COMPLETED
    out.is_overdue = is_overdue(contract)
    out.effective_completion_date = effective_completion_date(contract)
    out.status_label = STATUS_LABELS.get(contract.status, contract.status.value)
    return out


def serialize_list_item(contract: Contract, user: User) -> ContractListItem:
    return ContractListItem(
        id=contract.id,
        project_name=contract.project_name,
        contract_no=contract.contract_no,
        contract_name=contract.contract_name,
        category=contract.category,
        priority=contract.priority,
        procurement_method=contract.procurement_method,
        office_region=contract.office_region,
        funds=contract.funds,
        status=contract.status,
        current_owner_role=contract.current_owner_role,
        contractor_id=contract.contractor_id,
        contractor_name=contract.contractor.name if contract.contractor else None,
        awarded_amount_without_vat=float(contract.awarded_amount_without_vat)
        if contract.awarded_amount_without_vat is not None
        else None,
        target_completion=contract.target_completion,
        original_intended_completion_date=contract.original_intended_completion_date,
        revised_completion_date=contract.revised_completion_date,
        effective_completion_date=effective_completion_date(contract),
        completed_at=contract.completed_at,
        created_at=contract.created_at,
        updated_at=contract.updated_at,
        version=contract.version,
        is_overdue=is_overdue(contract),
        assigned_to_me=contract.current_owner_role == user.role
        and contract.status != ContractStatus.COMPLETED,
    )


# ─────────────────────────────────────────────────────────────────────────────
# Validation helpers
# ─────────────────────────────────────────────────────────────────────────────
def validate_lookup_values(db: Session, values: dict[str, Any]) -> None:
    for field, list_type in LOOKUP_FIELD_MAP.items():
        value = values.get(field)
        if not value:
            continue
        exists = db.scalar(
            select(LookupValue.id).where(
                LookupValue.list_type == list_type.value,
                LookupValue.value == value,
                LookupValue.is_active.is_(True),
            )
        )
        if not exists:
            allowed = db.scalars(
                select(LookupValue.value)
                .where(LookupValue.list_type == list_type.value, LookupValue.is_active.is_(True))
                .order_by(LookupValue.sort_order)
            ).all()
            raise ValidationError(
                f"'{value}' is not an active {list_type.value.replace('_', ' ')} option.",
                details={"field": field, "allowed": list(allowed)},
            )


def validate_contractor(db: Session, contractor_id: int | None) -> None:
    if contractor_id is None:
        return
    contractor = db.get(Contractor, contractor_id)
    if contractor is None:
        raise ValidationError("The selected contractor does not exist.", details={"field": "contractor_id"})


def validate_team_members(
    db: Session, member_ids: list[int] | None, *, field: str = "bec_member_ids"
) -> None:
    if not member_ids:
        return
    unique_ids = set(member_ids)
    found = set(
        db.scalars(
            select(EvaluationTeamMember.id).where(
                EvaluationTeamMember.id.in_(unique_ids),
                EvaluationTeamMember.is_active.is_(True),
            )
        ).all()
    )
    missing = unique_ids - found
    if missing:
        label = FIELD_LABELS.get(field, "BEC members")
        raise ValidationError(
            f"One or more selected {label.lower()} are invalid or inactive.",
            details={"member_ids": sorted(missing), "field": field},
        )


def ensure_contract_no_unique(db: Session, contract_no: str | None, exclude_id: int | None = None) -> None:
    if not contract_no:
        return
    stmt = select(Contract.id).where(Contract.contract_no == contract_no)
    if exclude_id is not None:
        stmt = stmt.where(Contract.id != exclude_id)
    existing = db.scalar(stmt)
    if existing:
        raise ValidationError(
            f"Contract No '{contract_no}' is already used by record #{existing}.",
            details={"field": "contract_no"},
        )


# ─────────────────────────────────────────────────────────────────────────────
# Create / update
# ─────────────────────────────────────────────────────────────────────────────
def create_contract(db: Session, user: User, payload: ContractCreate) -> Contract:
    if user.role not in {UserRole.PC_MANAGER, UserRole.ADMIN}:
        raise ForbiddenError("Only the P&C Manager can open a new contract record.")
    if user.role == UserRole.ADMIN:
        if not payload.admin_override or not (payload.override_reason or "").strip():
            raise ForbiddenError(
                "Administrator creation requires override mode and a written reason.",
                code="admin_override_required",
            )
    values = payload.model_dump(exclude_unset=True, exclude={"admin_override", "override_reason"})
    values = {field: normalize_value(field, value) for field, value in values.items() if field in FIELD_META}
    if user.role == UserRole.PC_MANAGER:
        disallowed = [
            field
            for field, value in values.items()
            if field not in SECTION_FIELDS[UserRole.PC_MANAGER] and value is not None
        ]
        if disallowed:
            raise ForbiddenError(
                "The P&C Manager opens the record with Orders 1–7 only. "
                "QS and P&C Engineer fields are completed at their own stages."
            )

    validate_lookup_values(db, values)
    if values.get("contractor_id") is not None:
        validate_contractor(db, values["contractor_id"])
    for field in MEMBER_TABLE_FIELDS:
        if values.get(field) is not None:
            validate_team_members(db, values[field], field=field)
    ensure_contract_no_unique(db, values.get("contract_no"))

    contract = Contract(
        status=ContractStatus.DRAFT_PC_MANAGER,
        current_owner_role=UserRole.PC_MANAGER,
        version=1,
        created_by_id=user.id,
        updated_by_id=user.id,
    )
    for field, value in values.items():
        if field in MEMBER_TABLE_FIELDS:
            continue
        setattr(contract, field, value)
    db.add(contract)
    db.flush()

    for field, table in MEMBER_TABLE_FIELDS.items():
        member_ids = values.get(field) or []
        if member_ids:
            db.execute(
                insert(table),
                [{"contract_id": contract.id, "member_id": member_id} for member_id in member_ids],
            )

    ensure_required(contract, REQUIRED_FOR_CREATE, "Opening the contract record")

    reason = payload.override_reason if user.role == UserRole.ADMIN else "Contract record opened."
    add_handoff(
        db,
        contract,
        user,
        action=HandoffAction.CREATED,
        from_status=None,
        to_status=ContractStatus.DRAFT_PC_MANAGER.value,
        from_role=None,
        to_role=UserRole.PC_MANAGER.value,
        reason=reason,
        version_after=1,
        admin_override=user.role == UserRole.ADMIN,
    )
    add_action_audit(
        db,
        contract,
        user,
        action=AuditAction.CREATE,
        field_name="status",
        old_value=None,
        new_value=ContractStatus.DRAFT_PC_MANAGER.value,
        reason=reason,
        admin_override=user.role == UserRole.ADMIN,
    )
    project_label = contract.project_name or contract.contract_no or f"Contract #{contract.id}"
    notify_users(
        db,
        [user.id],
        kind="confirmation",
        title=f"You opened {project_label}",
        body="The record is now a draft in your section.",
        contract_id=contract.id,
        actor_id=user.id,
    )
    db.commit()
    db.expire_all()
    return get_contract_or_404(db, contract.id)


def update_contract(db: Session, contract_id: int, user: User, payload: ContractUpdate) -> Contract:
    contract = get_contract_or_404(db, contract_id)
    if contract.version != payload.version:
        raise StaleVersionError(contract.version)

    raw_values = payload.model_dump(
        exclude_unset=True,
        exclude={"version", "reason", "admin_override", "override_reason"},
    )
    values = {
        field: normalize_value(field, value)
        for field, value in raw_values.items()
        if field in FIELD_META
    }

    # Compare against current values, including the member-picker fields.
    changes: list[tuple[str, Any, Any]] = []
    for field, new_value in values.items():
        if field in MEMBER_TABLE_FIELDS:
            old_ids = sorted(
                member.id for member in getattr(contract, MEMBER_RELATIONSHIPS[field])
            )
            if old_ids != new_value:
                changes.append((field, old_ids, new_value))
            continue
        old_value = getattr(contract, field)
        if field in {"awarded_amount_without_vat", "p_bond_amount_lkr"} and old_value is not None:
            old_value = Decimal(str(old_value)).quantize(Decimal("0.01"))
        if old_value != new_value:
            changes.append((field, old_value, new_value))

    if not changes:
        return contract

    changed_fields = [field for field, _, _ in changes]
    assert_edit_allowed(
        user,
        contract,
        changed_fields,
        admin_override=payload.admin_override,
        override_reason=payload.override_reason,
    )

    validate_lookup_values(db, values)
    if "contractor_id" in values:
        validate_contractor(db, values["contractor_id"])
    for field in MEMBER_TABLE_FIELDS:
        if field in values:
            validate_team_members(db, values[field], field=field)
    if "contract_no" in values:
        ensure_contract_no_unique(db, values["contract_no"], exclude_id=contract.id)

    now = datetime.now(UTC)
    update_values = {
        field: new_value for field, new_value in values.items() if field not in MEMBER_TABLE_FIELDS
    }
    update_values.update(
        version=Contract.version + 1,
        updated_at=now,
        updated_by_id=user.id,
    )
    try:
        result = db.execute(
            update(Contract)
            .where(Contract.id == contract_id, Contract.version == payload.version)
            .values(**update_values)
        )
    except IntegrityError as exc:
        db.rollback()
        raise ValidationError("The contract number or another unique field is already in use.") from exc

    if result.rowcount == 0:
        db.rollback()
        fresh = db.get(Contract, contract_id)
        raise StaleVersionError(fresh.version if fresh else None)

    for field, table in MEMBER_TABLE_FIELDS.items():
        if field not in values:
            continue
        db.execute(delete(table).where(table.c.contract_id == contract_id))
        member_ids = values[field] or []
        if member_ids:
            db.execute(
                insert(table),
                [{"contract_id": contract_id, "member_id": member_id} for member_id in member_ids],
            )

    effective_reason = payload.override_reason if payload.admin_override else payload.reason
    if payload.admin_override and payload.reason:
        effective_reason = f"{payload.override_reason} — {payload.reason}"
    add_field_audits(
        db,
        contract,
        user,
        changes,
        reason=effective_reason,
        admin_override=payload.admin_override,
        action=AuditAction.ADMIN_OVERRIDE if payload.admin_override else AuditAction.FIELD_UPDATE,
    )
    db.commit()
    db.expire_all()
    return get_contract_or_404(db, contract_id)


# ─────────────────────────────────────────────────────────────────────────────
# Querying
# ─────────────────────────────────────────────────────────────────────────────
def list_contracts(
    db: Session,
    user: User,
    *,
    q: str | None = None,
    status: str | None = None,
    owner_role: str | None = None,
    category: str | None = None,
    office_region: str | None = None,
    procurement_method: str | None = None,
    priority: str | None = None,
    funds: str | None = None,
    contractor_id: int | None = None,
    mine: bool = False,
    received_from: date | None = None,
    received_to: date | None = None,
    sort: str = "updated_at",
    direction: str = "desc",
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Contract], int]:
    conditions = []
    if q:
        pattern = f"%{q.strip()}%"
        conditions.append(
            or_(
                Contract.project_name.ilike(pattern),
                Contract.contract_no.ilike(pattern),
                Contract.contract_name.ilike(pattern),
                Contractor.name.ilike(pattern),
            )
        )
    if status:
        statuses = [item.strip() for item in status.split(",") if item.strip()]
        if statuses:
            conditions.append(Contract.status.in_([ContractStatus(s) for s in statuses]))
    if owner_role:
        conditions.append(Contract.current_owner_role == UserRole(owner_role))
    if category:
        conditions.append(Contract.category == category)
    if office_region:
        conditions.append(Contract.office_region == office_region)
    if procurement_method:
        conditions.append(Contract.procurement_method == procurement_method)
    if priority:
        conditions.append(Contract.priority == priority)
    if funds:
        conditions.append(Contract.funds == funds)
    if contractor_id:
        conditions.append(Contract.contractor_id == contractor_id)
    if mine:
        conditions.append(Contract.current_owner_role == user.role)
        conditions.append(Contract.status != ContractStatus.COMPLETED)
    if received_from:
        conditions.append(Contract.request_receiving_date >= received_from)
    if received_to:
        conditions.append(Contract.request_receiving_date <= received_to)

    sort_columns = {
        "updated_at": Contract.updated_at,
        "created_at": Contract.created_at,
        "project_name": Contract.project_name,
        "contract_no": Contract.contract_no,
        "awarded_amount_without_vat": Contract.awarded_amount_without_vat,
        "target_completion": Contract.target_completion,
        "status": Contract.status,
    }
    sort_column = sort_columns.get(sort, Contract.updated_at)
    order = sort_column.desc() if direction.lower() == "desc" else sort_column.asc()

    base = select(Contract).outerjoin(Contractor, Contract.contractor_id == Contractor.id)
    if conditions:
        base = base.where(*conditions)
    count = db.scalar(select(func.count(Contract.id)).outerjoin(Contractor).where(*conditions)) if conditions else db.scalar(
        select(func.count(Contract.id))
    )
    page = max(page, 1)
    page_size = min(max(page_size, 1), 100)
    stmt = (
        base.options(selectinload(Contract.contractor))
        .order_by(order, Contract.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    rows = list(db.scalars(stmt).all())
    return rows, int(count or 0)


# ─────────────────────────────────────────────────────────────────────────────
# History
# ─────────────────────────────────────────────────────────────────────────────
def list_handoffs(db: Session, contract_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        select(ContractHandoff, User.full_name)
        .outerjoin(User, ContractHandoff.acted_by_id == User.id)
        .where(ContractHandoff.contract_id == contract_id)
        .order_by(ContractHandoff.created_at.asc(), ContractHandoff.id.asc())
    ).all()
    result: list[dict[str, Any]] = []
    previous_at = None
    for handoff, acted_by_name in rows:
        duration = None
        if previous_at is not None:
            duration = round((handoff.created_at - previous_at).total_seconds() / 3600, 2)
        result.append(
            {
                "id": handoff.id,
                "contract_id": handoff.contract_id,
                "from_status": handoff.from_status,
                "to_status": handoff.to_status,
                "action": handoff.action,
                "from_role": handoff.from_role,
                "to_role": handoff.to_role,
                "acted_by_id": handoff.acted_by_id,
                "acted_by_name": acted_by_name,
                "reason": handoff.reason,
                "is_admin_override": handoff.is_admin_override,
                "version_after": handoff.version_after,
                "created_at": handoff.created_at,
                "duration_in_previous_stage_hours": duration,
            }
        )
        previous_at = handoff.created_at
    return result


def list_contract_audit(db: Session, contract_id: int) -> list[dict[str, Any]]:
    rows = db.execute(
        select(AuditLog, User.full_name)
        .outerjoin(User, AuditLog.user_id == User.id)
        .where(AuditLog.contract_id == contract_id)
        .order_by(AuditLog.changed_at.desc(), AuditLog.id.desc())
    ).all()
    return [
        {
            "id": log.id,
            "contract_id": log.contract_id,
            "user_id": log.user_id,
            "user_name": name,
            "action": log.action,
            "field_name": log.field_name,
            "old_value": log.old_value,
            "new_value": log.new_value,
            "reason": log.reason,
            "is_admin_override": log.is_admin_override,
            "changed_at": log.changed_at,
        }
        for log, name in rows
    ]

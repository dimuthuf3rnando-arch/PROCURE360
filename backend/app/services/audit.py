import json
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from sqlalchemy.orm import Session

from app.models.audit import AuditLog, ContractHandoff
from app.models.contract import Contract
from app.models.enums import AuditAction, HandoffAction
from app.models.user import User


def serialize_value(value: Any) -> str | None:
    if value is None:
        return None
    if isinstance(value, Enum):
        return str(value.value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return format(value, "f")
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, (list, tuple, set, dict)):
        return json.dumps(value, default=str, ensure_ascii=False)
    return str(value)


def add_field_audits(
    db: Session,
    contract: Contract,
    user: User,
    changes: list[tuple[str, Any, Any]],
    *,
    reason: str | None = None,
    admin_override: bool = False,
    action: AuditAction = AuditAction.FIELD_UPDATE,
) -> None:
    for field_name, old_value, new_value in changes:
        db.add(
            AuditLog(
                contract_id=contract.id,
                user_id=user.id,
                action=action.value,
                field_name=field_name,
                old_value=serialize_value(old_value),
                new_value=serialize_value(new_value),
                reason=reason,
                is_admin_override=admin_override,
            )
        )


def add_action_audit(
    db: Session,
    contract: Contract,
    user: User,
    *,
    action: AuditAction,
    field_name: str,
    old_value: Any,
    new_value: Any,
    reason: str | None,
    admin_override: bool = False,
) -> None:
    db.add(
        AuditLog(
            contract_id=contract.id,
            user_id=user.id,
            action=action.value,
            field_name=field_name,
            old_value=serialize_value(old_value),
            new_value=serialize_value(new_value),
            reason=reason,
            is_admin_override=admin_override,
        )
    )


def add_handoff(
    db: Session,
    contract: Contract,
    user: User,
    *,
    action: HandoffAction,
    from_status: str | None,
    to_status: str,
    from_role: str | None,
    to_role: str | None,
    reason: str | None,
    version_after: int,
    admin_override: bool = False,
) -> None:
    db.add(
        ContractHandoff(
            contract_id=contract.id,
            from_status=from_status,
            to_status=to_status,
            action=action.value,
            from_role=from_role,
            to_role=to_role,
            acted_by_id=user.id,
            reason=reason,
            is_admin_override=admin_override,
            version_after=version_after,
        )
    )

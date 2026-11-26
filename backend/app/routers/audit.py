from datetime import date, datetime, time

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import require_roles
from app.models.audit import AuditLog, ContractHandoff
from app.models.contract import Contract
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.audit import AuditLogOut, AuditSummary, HandoffOut
from app.schemas.common import Page

router = APIRouter(prefix="/audit", tags=["Audit"])
AdminUser = Depends(require_roles(UserRole.ADMIN))


@router.get("/logs", response_model=Page[AuditLogOut])
def logs(
    _: User = AdminUser,
    db: Session = Depends(get_db),
    contract_id: int | None = None,
    user_id: int | None = None,
    action: str | None = None,
    field_name: str | None = None,
    admin_only: bool = False,
    date_from: date | None = None,
    date_to: date | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    conditions = []
    if contract_id:
        conditions.append(AuditLog.contract_id == contract_id)
    if user_id:
        conditions.append(AuditLog.user_id == user_id)
    if action:
        conditions.append(AuditLog.action == action)
    if field_name:
        conditions.append(AuditLog.field_name.ilike(f"%{field_name}%"))
    if admin_only:
        conditions.append(AuditLog.is_admin_override.is_(True))
    if date_from:
        conditions.append(AuditLog.changed_at >= datetime.combine(date_from, time.min))
    if date_to:
        conditions.append(AuditLog.changed_at <= datetime.combine(date_to, time.max))

    total = db.scalar(select(func.count(AuditLog.id)).where(*conditions)) or 0
    rows = db.execute(
        select(AuditLog, User.full_name, Contract.contract_no, Contract.project_name)
        .outerjoin(User, AuditLog.user_id == User.id)
        .outerjoin(Contract, AuditLog.contract_id == Contract.id)
        .where(*conditions)
        .order_by(AuditLog.changed_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        AuditLogOut(
            id=log.id,
            contract_id=log.contract_id,
            contract_no=contract_no,
            project_name=project_name,
            user_id=log.user_id,
            user_name=user_name,
            action=log.action,
            field_name=log.field_name,
            old_value=log.old_value,
            new_value=log.new_value,
            reason=log.reason,
            is_admin_override=log.is_admin_override,
            changed_at=log.changed_at,
        )
        for log, user_name, contract_no, project_name in rows
    ]
    return Page[AuditLogOut](
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total else 0,
    )


@router.get("/handoffs", response_model=Page[HandoffOut])
def handoffs(
    _: User = AdminUser,
    db: Session = Depends(get_db),
    contract_id: int | None = None,
    action: str | None = None,
    admin_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    conditions = []
    if contract_id:
        conditions.append(ContractHandoff.contract_id == contract_id)
    if action:
        conditions.append(ContractHandoff.action == action)
    if admin_only:
        conditions.append(ContractHandoff.is_admin_override.is_(True))
    total = db.scalar(select(func.count(ContractHandoff.id)).where(*conditions)) or 0
    rows = db.execute(
        select(ContractHandoff, User.full_name)
        .outerjoin(User, ContractHandoff.acted_by_id == User.id)
        .where(*conditions)
        .order_by(ContractHandoff.created_at.desc(), ContractHandoff.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    items = [
        HandoffOut(
            id=handoff.id,
            contract_id=handoff.contract_id,
            from_status=handoff.from_status,
            to_status=handoff.to_status,
            action=handoff.action,
            from_role=handoff.from_role,
            to_role=handoff.to_role,
            acted_by_id=handoff.acted_by_id,
            acted_by_name=user_name,
            reason=handoff.reason,
            is_admin_override=handoff.is_admin_override,
            version_after=handoff.version_after,
            created_at=handoff.created_at,
            duration_in_previous_stage_hours=None,
        )
        for handoff, user_name in rows
    ]
    return Page[HandoffOut](
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total else 0,
    )


@router.get("/summary", response_model=AuditSummary)
def summary(_: User = AdminUser, db: Session = Depends(get_db)):
    total_changes = db.scalar(select(func.count(AuditLog.id))) or 0
    total_handoffs = db.scalar(select(func.count(ContractHandoff.id))) or 0
    override_count = db.scalar(
        select(func.count(AuditLog.id)).where(AuditLog.is_admin_override.is_(True))
    ) or 0
    return_count = db.scalar(
        select(func.count(ContractHandoff.id)).where(ContractHandoff.action == "RETURN_TO_PREVIOUS")
    ) or 0
    return AuditSummary(
        total_changes=total_changes,
        total_handoffs=total_handoffs,
        override_count=override_count,
        return_count=return_count,
    )

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.errors import NotFoundError
from app.core.security import CurrentUser
from app.models.contract import Contract
from app.models.notification import Notification
from app.models.user import User
from app.schemas.common import Message, Page
from app.schemas.notification import NotificationOut, UnreadCount
from app.services.bond_notifications import ensure_bond_expiry_notifications

router = APIRouter(prefix="/notifications", tags=["Notifications"])


def _out(row: tuple[Notification, str | None, str | None, str | None]) -> NotificationOut:
    notification, actor_name, contract_no, project_name = row
    return NotificationOut(
        id=notification.id,
        user_id=notification.user_id,
        contract_id=notification.contract_id,
        actor_id=notification.actor_id,
        actor_name=actor_name,
        contract_no=contract_no,
        project_name=project_name,
        kind=notification.kind,
        title=notification.title,
        body=notification.body,
        is_read=notification.is_read,
        created_at=notification.created_at,
        read_at=notification.read_at,
    )


@router.get("", response_model=Page[NotificationOut])
def list_notifications(
    user: CurrentUser,
    db: Session = Depends(get_db),
    unread_only: bool = False,
    kind: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
):
    ensure_bond_expiry_notifications(db)
    # Read notifications are kept for 10 minutes after viewing, then removed.
    db.execute(
        delete(Notification).where(
            Notification.user_id == user.id,
            Notification.is_read.is_(True),
            Notification.read_at.is_not(None),
            Notification.read_at < datetime.now(UTC) - timedelta(minutes=10),
        )
    )
    db.commit()

    conditions = [Notification.user_id == user.id]
    if unread_only:
        conditions.append(Notification.is_read.is_(False))
    if kind:
        conditions.append(Notification.kind == kind)

    total = db.scalar(select(func.count(Notification.id)).where(*conditions)) or 0
    rows = db.execute(
        select(Notification, User.full_name, Contract.contract_no, Contract.project_name)
        .outerjoin(User, Notification.actor_id == User.id)
        .outerjoin(Contract, Notification.contract_id == Contract.id)
        .where(*conditions)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    ).all()
    return Page[NotificationOut](
        items=[_out(row) for row in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=(total + page_size - 1) // page_size if total else 0,
    )


@router.get("/unread-count", response_model=UnreadCount)
def unread_count(user: CurrentUser, db: Session = Depends(get_db)):
    ensure_bond_expiry_notifications(db)
    count = db.scalar(
        select(func.count(Notification.id)).where(
            Notification.user_id == user.id, Notification.is_read.is_(False)
        )
    ) or 0
    return UnreadCount(count=count)


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int,
    user: CurrentUser,
    db: Session = Depends(get_db),
):
    notification = db.get(Notification, notification_id)
    if notification is None or notification.user_id != user.id:
        raise NotFoundError("Notification not found.")
    notification.is_read = True
    notification.read_at = datetime.now(UTC)
    db.commit()
    row = db.execute(
        select(Notification, User.full_name, Contract.contract_no, Contract.project_name)
        .outerjoin(User, Notification.actor_id == User.id)
        .outerjoin(Contract, Notification.contract_id == Contract.id)
        .where(Notification.id == notification_id)
    ).one()
    return _out(row)


@router.post("/read-all", response_model=Message)
def mark_all_read(user: CurrentUser, db: Session = Depends(get_db)):
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.is_read.is_(False))
        .values(is_read=True, read_at=datetime.now(UTC))
    )
    db.commit()
    return Message(message="All notifications marked as read.")

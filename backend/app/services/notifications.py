from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.enums import UserRole
from app.models.notification import Notification
from app.models.user import User


def notify_users(
    db: Session,
    user_ids: Iterable[int],
    *,
    kind: str,
    title: str,
    body: str | None = None,
    contract_id: int | None = None,
    actor_id: int | None = None,
) -> int:
    """Stage one notification row per recipient. Caller owns the commit."""
    created = 0
    for user_id in set(user_ids):
        if user_id is None:
            continue
        db.add(
            Notification(
                user_id=user_id,
                contract_id=contract_id,
                actor_id=actor_id,
                kind=kind,
                title=title,
                body=body,
            )
        )
        created += 1
    return created


def notify_role(
    db: Session,
    role: UserRole,
    *,
    kind: str,
    title: str,
    body: str | None = None,
    contract_id: int | None = None,
    actor_id: int | None = None,
    exclude_user_ids: Iterable[int] = (),
) -> int:
    excluded = set(exclude_user_ids)
    ids = db.scalars(
        select(User.id).where(User.role == role, User.is_active.is_(True))
    ).all()
    return notify_users(
        db,
        [user_id for user_id in ids if user_id not in excluded],
        kind=kind,
        title=title,
        body=body,
        contract_id=contract_id,
        actor_id=actor_id,
    )

from datetime import UTC, date, datetime
from threading import Lock

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.contract import Contract
from app.models.notification import BondAlert, Notification
from app.models.user import User

_LAST_BOND_CHECK: datetime | None = None
_CHECK_LOCK = Lock()

# Warn one month before expiry (aligned with the register's bond warning window).
BOND_WARNING_DAYS = 30


def _alert_copy(contract: Contract, days: int) -> tuple[str, str, str]:
    label = contract.project_name or contract.contract_no or f"Contract #{contract.id}"
    if len(label) > 110:
        label = f"{label[:107]}…"
    expiry = contract.p_bond_expiry_date
    expiry_text = expiry.isoformat() if expiry else "an unknown date"

    if days < 0:
        overdue = abs(days)
        unit = "day" if overdue == 1 else "days"
        return (
            "bond_expired",
            f"Performance bond expired {overdue} {unit} ago · {label}",
            f"The performance bond for {label} expired on {expiry_text}. Confirm the release or renewal.",
        )
    if days == 0:
        return (
            "bond_expiring",
            f"Performance bond expires today · {label}",
            f"The performance bond for {label} expires today ({expiry_text}).",
        )
    if days == 1:
        return (
            "bond_expiring",
            f"Performance bond expires tomorrow · {label}",
            f"The performance bond for {label} expires tomorrow ({expiry_text}).",
        )
    return (
        "bond_expiring",
        f"Performance bond expires in {days} days · {label}",
        f"The performance bond for {label} expires on {expiry_text}.",
    )


def ensure_bond_expiry_notifications(db: Session) -> None:
    """Warn every active user once when a bond is within a month or has expired."""
    global _LAST_BOND_CHECK
    now = datetime.now(UTC)
    with _CHECK_LOCK:
        if _LAST_BOND_CHECK is not None and (now - _LAST_BOND_CHECK).total_seconds() < 300:
            return
        _LAST_BOND_CHECK = now

        today = date.today()
        contracts = list(
            db.scalars(select(Contract).where(Contract.p_bond_expiry_date.is_not(None))).all()
        )
        users = list(db.scalars(select(User).where(User.is_active.is_(True))).all())
        if not contracts or not users:
            return

        created = False
        for contract in contracts:
            expiry = contract.p_bond_expiry_date
            if expiry is None:
                continue
            days = (expiry - today).days
            if days > BOND_WARNING_DAYS:
                continue

            kind, title, body = _alert_copy(contract, days)
            delivered = set(
                db.scalars(
                    select(BondAlert.user_id).where(
                        BondAlert.contract_id == contract.id,
                        BondAlert.kind == kind,
                        BondAlert.expiry_date == expiry,
                    )
                ).all()
            )
            for user in users:
                if user.id in delivered:
                    continue
                try:
                    with db.begin_nested():
                        db.add(
                            Notification(
                                user_id=user.id,
                                contract_id=contract.id,
                                actor_id=None,
                                kind=kind,
                                title=title,
                                body=body,
                            )
                        )
                        db.add(
                            BondAlert(
                                user_id=user.id,
                                contract_id=contract.id,
                                kind=kind,
                                expiry_date=expiry,
                                notified_at=now,
                            )
                        )
                    delivered.add(user.id)
                    created = True
                except IntegrityError:
                    # A concurrent request already wrote this alert.
                    continue

        if created:
            db.commit()

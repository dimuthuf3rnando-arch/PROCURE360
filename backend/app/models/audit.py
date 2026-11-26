from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class ContractHandoff(Base):
    __tablename__ = "contract_handoffs"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_status: Mapped[str | None] = mapped_column(String(40))
    to_status: Mapped[str] = mapped_column(String(40), nullable=False)
    action: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    from_role: Mapped[str | None] = mapped_column(String(32))
    to_role: Mapped[str | None] = mapped_column(String(32))
    acted_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reason: Mapped[str | None] = mapped_column(Text)
    is_admin_override: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    version_after: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )

    contract: Mapped["Contract"] = relationship(back_populates="handoffs")  # noqa: F821
    acted_by: Mapped["User | None"] = relationship()  # noqa: F821


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    contract_id: Mapped[int] = mapped_column(
        ForeignKey("contracts.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(40), default="FIELD_UPDATE", nullable=False, index=True)
    field_name: Mapped[str | None] = mapped_column(String(120), index=True)
    old_value: Mapped[str | None] = mapped_column(Text)
    new_value: Mapped[str | None] = mapped_column(Text)
    reason: Mapped[str | None] = mapped_column(Text)
    is_admin_override: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    changed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False, index=True
    )

    contract: Mapped["Contract"] = relationship(back_populates="audit_logs")  # noqa: F821
    user: Mapped["User | None"] = relationship()  # noqa: F821

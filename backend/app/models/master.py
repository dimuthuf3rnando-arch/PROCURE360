from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class EvaluationTeamMember(Base):
    __tablename__ = "evaluation_team_members"
    __table_args__ = (UniqueConstraint("name", "designation", name="uq_eval_team_name_designation"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    designation: Mapped[str | None] = mapped_column(String(160))
    display_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class LookupValue(Base):
    __tablename__ = "lookup_values"
    __table_args__ = (UniqueConstraint("list_type", "value", name="uq_lookup_type_value"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    list_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    value: Mapped[str] = mapped_column(String(160), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

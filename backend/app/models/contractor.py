from datetime import UTC, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


class Contractor(Base):
    __tablename__ = "contractors"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(220), unique=True, nullable=False, index=True)
    registration_no: Mapped[str | None] = mapped_column(String(100))
    contact_person: Mapped[str | None] = mapped_column(String(160))
    phone: Mapped[str | None] = mapped_column(String(60))
    email: Mapped[str | None] = mapped_column(String(180))
    address: Mapped[str | None] = mapped_column(String(400))
    office_region: Mapped[str | None] = mapped_column(String(100))
    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    contracts: Mapped[list["Contract"]] = relationship(back_populates="contractor")  # noqa: F821
    ratings: Mapped[list["ContractorRating"]] = relationship(
        back_populates="contractor", cascade="all, delete-orphan"
    )


class ContractorRating(Base):
    __tablename__ = "contractor_ratings"
    __table_args__ = (
        CheckConstraint("quality_score BETWEEN 1 AND 5", name="quality_range"),
        CheckConstraint("schedule_score BETWEEN 1 AND 5", name="schedule_range"),
        CheckConstraint("compliance_score BETWEEN 1 AND 5", name="compliance_range"),
        CheckConstraint("safety_score BETWEEN 1 AND 5", name="safety_range"),
        UniqueConstraint("contractor_id", "contract_id", name="uq_rating_contractor_contract"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    contractor_id: Mapped[int] = mapped_column(
        ForeignKey("contractors.id", ondelete="CASCADE"), nullable=False, index=True
    )
    contract_id: Mapped[int | None] = mapped_column(
        ForeignKey("contracts.id", ondelete="SET NULL"), index=True
    )
    quality_score: Mapped[int] = mapped_column(Integer, nullable=False)
    schedule_score: Mapped[int] = mapped_column(Integer, nullable=False)
    compliance_score: Mapped[int] = mapped_column(Integer, nullable=False)
    safety_score: Mapped[int] = mapped_column(Integer, nullable=False)
    comments: Mapped[str | None] = mapped_column(Text)
    rated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False
    )

    contractor: Mapped[Contractor] = relationship(back_populates="ratings")
    contract: Mapped["Contract | None"] = relationship(back_populates="ratings")  # noqa: F821
    rated_by: Mapped["User | None"] = relationship()  # noqa: F821

    @property
    def weighted_score(self) -> Decimal:
        from app.core.config import settings

        weights = settings.subjective_weights
        value = (
            self.quality_score * weights["quality"]
            + self.schedule_score * weights["schedule"]
            + self.compliance_score * weights["compliance"]
            + self.safety_score * weights["safety"]
        )
        return Decimal(str(round(value, 2)))

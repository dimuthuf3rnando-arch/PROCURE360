from datetime import UTC, date, datetime
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.enums import ContractStatus, PeriodUnit, UserRole

contract_bec_members = Table(
    "contract_bec_members",
    Base.metadata,
    Column("contract_id", ForeignKey("contracts.id", ondelete="CASCADE"), primary_key=True),
    Column("member_id", ForeignKey("evaluation_team_members.id", ondelete="CASCADE"), primary_key=True),
)

contract_doc_evaluation_members = Table(
    "contract_doc_evaluation_members",
    Base.metadata,
    Column("contract_id", ForeignKey("contracts.id", ondelete="CASCADE"), primary_key=True),
    Column("member_id", ForeignKey("evaluation_team_members.id", ondelete="CASCADE"), primary_key=True),
)

# Fields that store their value in a join table rather than a column.
MEMBER_TABLE_FIELDS = {
    "bec_member_ids": contract_bec_members,
    "doc_evaluation_member_ids": contract_doc_evaluation_members,
}


def utcnow() -> datetime:
    return datetime.now(UTC)


class Contract(Base):
    """The procurement record. Field groups follow the 41 input orders.

    Orders 1–7   → P&C Manager
    Orders 8–20  → QS
    Orders 21–41 → P&C Engineer / Supply Officer
    """

    __tablename__ = "contracts"
    __table_args__ = (UniqueConstraint("contract_no", name="uq_contracts_contract_no"),)

    id: Mapped[int] = mapped_column(primary_key=True)

    # ── Workflow metadata ────────────────────────────────────────────────
    status: Mapped[ContractStatus] = mapped_column(
        SAEnum(
            ContractStatus,
            native_enum=False,
            length=40,
            values_callable=lambda e: [m.value for m in e],
        ),
        default=ContractStatus.DRAFT_PC_MANAGER,
        nullable=False,
        index=True,
    )
    current_owner_role: Mapped[UserRole] = mapped_column(
        SAEnum(UserRole, native_enum=False, length=32, values_callable=lambda e: [m.value for m in e]),
        default=UserRole.PC_MANAGER,
        nullable=False,
        index=True,
    )
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    return_reason: Mapped[str | None] = mapped_column(Text)
    returned_from_role: Mapped[UserRole | None] = mapped_column(
        SAEnum(UserRole, native_enum=False, length=32, values_callable=lambda e: [m.value for m in e])
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False, index=True
    )

    # ── Orders 1–7 · P&C Manager ────────────────────────────────────────
    project_name: Mapped[str | None] = mapped_column(String(255), index=True)
    request_receiving_date: Mapped[date | None] = mapped_column(Date)
    category: Mapped[str | None] = mapped_column(String(100), index=True)
    priority: Mapped[str | None] = mapped_column(String(50), index=True)
    procurement_method: Mapped[str | None] = mapped_column(String(100), index=True)
    office_region: Mapped[str | None] = mapped_column(String(100), index=True)
    target_completion: Mapped[date | None] = mapped_column(Date)

    # ── Orders 8–20 · QS ────────────────────────────────────────────────
    contract_no: Mapped[str | None] = mapped_column(String(100), index=True)
    contract_name: Mapped[str | None] = mapped_column(String(255), index=True)
    funds: Mapped[str | None] = mapped_column(String(100), index=True)
    document_complete_date: Mapped[date | None] = mapped_column(Date)  # 11
    signature_sent_date: Mapped[date | None] = mapped_column(Date)  # 12
    signature_received_date: Mapped[date | None] = mapped_column(Date)  # 13
    doc_evaluation_sent_date: Mapped[date | None] = mapped_column(Date)  # 14
    document_evaluation_committee: Mapped[str | None] = mapped_column(String(255))  # 15
    doc_evaluation_received_date: Mapped[date | None] = mapped_column(Date)  # 16
    comments_completed_sent_date: Mapped[date | None] = mapped_column(Date)  # 17
    documents_received_from_sign_date: Mapped[date | None] = mapped_column(Date)  # 18
    tender_notice_sending_date: Mapped[date | None] = mapped_column(Date)  # 19
    qs_remarks: Mapped[str | None] = mapped_column(Text)  # 20

    # ── Orders 21–41 · P&C Engineer / Supply Officer ────────────────────
    bid_closing_date: Mapped[date | None] = mapped_column(Date)  # 21
    bec_sent_date: Mapped[date | None] = mapped_column(Date)  # 23
    bec_due_date: Mapped[date | None] = mapped_column(Date)  # 24
    bec_received_date: Mapped[date | None] = mapped_column(Date)  # 25
    bid_bond_released: Mapped[bool | None] = mapped_column(Boolean)  # 26
    bec_recommendation: Mapped[str | None] = mapped_column(Text)  # 27
    rpc_held_on: Mapped[date | None] = mapped_column(Date)  # 28
    agm_approved_date: Mapped[date | None] = mapped_column(Date)  # 29
    contractor_id: Mapped[int | None] = mapped_column(
        ForeignKey("contractors.id", ondelete="SET NULL"), index=True
    )  # 30
    awarded_amount_without_vat: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))  # 31
    awarded_on: Mapped[date | None] = mapped_column(Date)  # 32
    agreement_signed_date: Mapped[date | None] = mapped_column(Date)  # 33
    tender_docs_sent: Mapped[bool | None] = mapped_column(Boolean)  # 34
    tender_docs_sent_date: Mapped[date | None] = mapped_column(Date)  # 34
    contract_period_value: Mapped[int | None] = mapped_column(Integer)  # 35
    contract_period_unit: Mapped[PeriodUnit | None] = mapped_column(
        SAEnum(PeriodUnit, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e])
    )  # 35
    physical_construction_commenced_on: Mapped[date | None] = mapped_column(Date)  # 36
    original_intended_completion_date: Mapped[date | None] = mapped_column(Date)  # 37
    extension_value: Mapped[int | None] = mapped_column(Integer)  # 38
    extension_unit: Mapped[PeriodUnit | None] = mapped_column(
        SAEnum(PeriodUnit, native_enum=False, length=16, values_callable=lambda e: [m.value for m in e])
    )  # 38
    revised_completion_date: Mapped[date | None] = mapped_column(Date)  # 38
    p_bond_amount_lkr: Mapped[Decimal | None] = mapped_column(Numeric(18, 2))  # 39
    p_bond_expiry_date: Mapped[date | None] = mapped_column(Date)  # 39
    p_bond_details: Mapped[str | None] = mapped_column(Text)  # 39
    pc_remarks: Mapped[str | None] = mapped_column(Text)  # 40
    engagement_order_ref: Mapped[str | None] = mapped_column(String(120))  # 41
    engagement_order_date: Mapped[date | None] = mapped_column(Date)  # 41

    # ── Relationships ───────────────────────────────────────────────────
    contractor: Mapped["Contractor | None"] = relationship(back_populates="contracts")  # noqa: F821
    created_by: Mapped["User | None"] = relationship(foreign_keys=[created_by_id])  # noqa: F821
    updated_by: Mapped["User | None"] = relationship(foreign_keys=[updated_by_id])  # noqa: F821
    bec_members: Mapped[list["EvaluationTeamMember"]] = relationship(  # noqa: F821
        secondary=contract_bec_members,
        lazy="selectin",
        order_by="EvaluationTeamMember.display_order",
    )
    doc_evaluation_members: Mapped[list["EvaluationTeamMember"]] = relationship(  # noqa: F821
        secondary=contract_doc_evaluation_members,
        lazy="selectin",
        order_by="EvaluationTeamMember.display_order",
    )
    handoffs: Mapped[list["ContractHandoff"]] = relationship(  # noqa: F821
        back_populates="contract", cascade="all, delete-orphan", order_by="ContractHandoff.created_at"
    )
    audit_logs: Mapped[list["AuditLog"]] = relationship(  # noqa: F821
        back_populates="contract", cascade="all, delete-orphan"
    )
    ratings: Mapped[list["ContractorRating"]] = relationship(back_populates="contract")  # noqa: F821

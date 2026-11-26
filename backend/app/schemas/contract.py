from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.models.enums import ContractStatus, PeriodUnit, UserRole
from app.schemas.common import APIModel
from app.schemas.master import EvaluationTeamMemberOut


class ContractorBrief(APIModel):
    id: int
    name: str
    registration_no: str | None = None
    office_region: str | None = None


class ContractFields(BaseModel):
    """All 41 normalized procurement inputs."""

    # Orders 1–7 · P&C Manager
    project_name: str | None = Field(default=None, max_length=255)
    request_receiving_date: date | None = None
    category: str | None = Field(default=None, max_length=100)
    priority: str | None = Field(default=None, max_length=50)
    procurement_method: str | None = Field(default=None, max_length=100)
    office_region: str | None = Field(default=None, max_length=100)
    target_completion: date | None = None

    # Orders 8–20 · QS
    contract_no: str | None = Field(default=None, max_length=100)
    contract_name: str | None = Field(default=None, max_length=255)
    funds: str | None = Field(default=None, max_length=100)
    document_complete_date: date | None = None  # 11
    signature_sent_date: date | None = None  # 12
    signature_received_date: date | None = None  # 13
    doc_evaluation_sent_date: date | None = None  # 14
    document_evaluation_committee: str | None = Field(default=None, max_length=255)  # 15 (legacy text)
    doc_evaluation_member_ids: list[int] | None = None  # 15 (member picker)
    doc_evaluation_received_date: date | None = None  # 16
    comments_completed_sent_date: date | None = None  # 17
    documents_received_from_sign_date: date | None = None  # 18
    tender_notice_sending_date: date | None = None  # 19
    qs_remarks: str | None = None  # 20

    # Orders 21–41 · P&C Engineer / Supply Officer
    bid_closing_date: date | None = None  # 21
    bec_member_ids: list[int] | None = None  # 22
    bec_sent_date: date | None = None  # 23
    bec_due_date: date | None = None  # 24
    bec_received_date: date | None = None  # 25
    bid_bond_released: bool | None = None  # 26
    bec_recommendation: str | None = None  # 27
    rpc_held_on: date | None = None  # 28
    agm_approved_date: date | None = None  # 29
    contractor_id: int | None = None  # 30
    awarded_amount_without_vat: float | None = Field(default=None, ge=0)  # 31
    awarded_on: date | None = None  # 32
    agreement_signed_date: date | None = None  # 33
    tender_docs_sent: bool | None = None  # 34
    tender_docs_sent_date: date | None = None  # 34
    contract_period_value: int | None = Field(default=None, ge=0)  # 35
    contract_period_unit: PeriodUnit | None = None  # 35
    physical_construction_commenced_on: date | None = None  # 36
    original_intended_completion_date: date | None = None  # 37
    extension_value: int | None = Field(default=None, ge=0)  # 38
    extension_unit: PeriodUnit | None = None  # 38
    revised_completion_date: date | None = None  # 38
    p_bond_amount_lkr: float | None = Field(default=None, ge=0)  # 39
    p_bond_expiry_date: date | None = None  # 39
    p_bond_details: str | None = None  # 39
    pc_remarks: str | None = None  # 40
    engagement_order_ref: str | None = Field(default=None, max_length=120)  # 41
    engagement_order_date: date | None = None  # 41


class ContractCreate(ContractFields):
    admin_override: bool = False
    override_reason: str | None = None


class ContractUpdate(ContractFields):
    version: int = Field(ge=1)
    reason: str | None = Field(default=None, max_length=1000)
    admin_override: bool = False
    override_reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _admin_reason_required(self):
        if self.admin_override and not (self.override_reason or "").strip():
            raise ValueError("An override reason is required for administrator edits.")
        return self


class TransitionBase(BaseModel):
    version: int = Field(ge=1)
    reason: str | None = Field(default=None, max_length=1000)
    admin_override: bool = False
    override_reason: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def _admin_reason_required(self):
        if self.admin_override and not (self.override_reason or "").strip():
            raise ValueError("An override reason is required for administrator actions.")
        return self


class ForwardRequest(TransitionBase):
    # QS only: choose which of the two equivalent next sections receives the file.
    target_role: UserRole | None = None


class CompleteRequest(TransitionBase):
    pass


class ReturnRequest(BaseModel):
    version: int = Field(ge=1)
    reason: str = Field(min_length=5, max_length=1000)
    admin_override: bool = False
    override_reason: str | None = None

    @model_validator(mode="after")
    def _admin_reason_required(self):
        if self.admin_override and not (self.override_reason or "").strip():
            raise ValueError("An override reason is required for administrator actions.")
        return self


class ValidationWarning(BaseModel):
    code: str
    message: str
    fields: list[str] = Field(default_factory=list)
    severity: Literal["warning", "error"] = "warning"


class ContractOut(ContractFields, APIModel):
    id: int
    status: ContractStatus
    current_owner_role: UserRole
    version: int
    return_reason: str | None = None
    returned_from_role: UserRole | None = None
    completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    created_by_id: int | None = None
    updated_by_id: int | None = None
    contractor: ContractorBrief | None = None
    bec_members: list[EvaluationTeamMemberOut] = Field(default_factory=list)

    # Derived, role-aware metadata
    warnings: list[ValidationWarning] = Field(default_factory=list)
    editable_fields: list[str] = Field(default_factory=list)
    editable_sections: list[str] = Field(default_factory=list)
    available_actions: list[str] = Field(default_factory=list)
    assigned_to_me: bool = False
    is_overdue: bool = False
    effective_completion_date: date | None = None
    status_label: str = ""


class ContractListItem(APIModel):
    id: int
    project_name: str | None
    contract_no: str | None
    contract_name: str | None
    category: str | None
    priority: str | None
    procurement_method: str | None
    office_region: str | None
    funds: str | None
    status: ContractStatus
    current_owner_role: UserRole
    contractor_id: int | None
    contractor_name: str | None
    awarded_amount_without_vat: float | None
    target_completion: date | None
    original_intended_completion_date: date | None
    revised_completion_date: date | None
    effective_completion_date: date | None
    completed_at: datetime | None
    created_at: datetime
    updated_at: datetime
    version: int
    is_overdue: bool = False
    assigned_to_me: bool = False


class ContractActionResponse(BaseModel):
    message: str
    contract: ContractOut

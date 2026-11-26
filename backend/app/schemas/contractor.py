from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.common import APIModel
from app.schemas.contract import ContractListItem
from app.schemas.master import EvaluationTeamMemberOut


class ContractorBase(BaseModel):
    name: str = Field(min_length=2, max_length=220)
    registration_no: str | None = Field(default=None, max_length=100)
    contact_person: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=180)
    address: str | None = Field(default=None, max_length=400)
    office_region: str | None = Field(default=None, max_length=100)
    notes: str | None = None
    is_active: bool = True


class ContractorCreate(ContractorBase):
    pass


class ContractorUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=220)
    registration_no: str | None = Field(default=None, max_length=100)
    contact_person: str | None = Field(default=None, max_length=160)
    phone: str | None = Field(default=None, max_length=60)
    email: str | None = Field(default=None, max_length=180)
    address: str | None = Field(default=None, max_length=400)
    office_region: str | None = Field(default=None, max_length=100)
    notes: str | None = None
    is_active: bool | None = None


class ContractorOut(ContractorBase, APIModel):
    id: int
    created_at: datetime
    updated_at: datetime


class RatingCreate(BaseModel):
    contract_id: int | None = None
    quality_score: int = Field(ge=1, le=5)
    schedule_score: int = Field(ge=1, le=5)
    compliance_score: int = Field(ge=1, le=5)
    safety_score: int = Field(ge=1, le=5)
    comments: str | None = Field(default=None, max_length=2000)


class RatingOut(APIModel):
    id: int
    contractor_id: int
    contract_id: int | None
    contract_no: str | None = None
    project_name: str | None = None
    quality_score: int
    schedule_score: int
    compliance_score: int
    safety_score: int
    weighted_score: float
    comments: str | None
    rated_by_id: int | None
    rated_by_name: str | None = None
    created_at: datetime
    updated_at: datetime


class DimensionScores(BaseModel):
    quality: float | None = None
    schedule: float | None = None
    compliance: float | None = None
    safety: float | None = None


class ContractorMetrics(BaseModel):
    total_contracts: int = 0
    completed_contracts: int = 0
    active_contracts: int = 0
    total_awarded_lkr: float = 0
    average_awarded_lkr: float = 0
    on_time_original_rate: float | None = None
    on_time_extended_rate: float | None = None
    average_mobilization_days: float | None = None
    mobilization_score: float | None = None
    schedule_score_original: float | None = None
    schedule_score_extended: float | None = None


class ScorecardOut(BaseModel):
    contractor: ContractorOut
    composite_score: float
    subjective_score: float | None = None
    objective_score: float | None = None
    rating_label: str
    rating_count: int = 0
    dimensions: DimensionScores = Field(default_factory=DimensionScores)
    metrics: ContractorMetrics = Field(default_factory=ContractorMetrics)
    recent_ratings: list[RatingOut] = Field(default_factory=list)


class ContractorDirectoryItem(BaseModel):
    id: int
    name: str
    registration_no: str | None
    contact_person: str | None
    phone: str | None
    email: str | None
    office_region: str | None
    is_active: bool
    composite_score: float
    rating_label: str
    rating_count: int
    contract_count: int
    completed_count: int
    total_awarded_lkr: float
    on_time_extended_rate: float | None
    average_mobilization_days: float | None


class ContractorDetailOut(BaseModel):
    scorecard: ScorecardOut
    contracts: list[ContractListItem] = Field(default_factory=list)
    ratings: list[RatingOut] = Field(default_factory=list)


# Kept for potential team-member embeds in contractor views.
TeamMember = EvaluationTeamMemberOut

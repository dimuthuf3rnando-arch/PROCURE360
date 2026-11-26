from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.contractor import ContractorDirectoryItem


class QueueBucket(BaseModel):
    status: str
    label: str
    owner_role: str
    count: int
    avg_age_days: float | None = None
    oldest_age_days: float | None = None


class BreakdownItem(BaseModel):
    key: str
    label: str
    total_lkr: float
    count: int


class CycleTimeItem(BaseModel):
    key: str
    label: str
    avg_days: float
    count: int


class MilestoneDuration(BaseModel):
    key: str
    label: str
    avg_days: float
    count: int


class AwardTrendItem(BaseModel):
    month: str
    label: str
    total_lkr: float
    count: int


class AlertItem(BaseModel):
    contract_id: int
    contract_no: str | None
    project_name: str | None
    contractor_name: str | None
    status: str
    stage_label: str
    date: date | None
    days_delta: int | None
    date_label: str
    amount_lkr: float | None = None
    severity: str = "warning"


class ActivityItem(BaseModel):
    id: int
    contract_id: int
    contract_no: str | None
    project_name: str | None
    action: str
    from_role: str | None
    to_role: str | None
    acted_by_name: str | None
    reason: str | None
    created_at: datetime


class DashboardTotals(BaseModel):
    total_contracts: int
    active_contracts: int
    completed_contracts: int
    total_awarded_lkr: float
    average_awarded_lkr: float
    awaiting_action: int
    overdue_bec: int
    due_soon: int
    expiring_bonds: int
    completion_rate: float
    avg_cycle_days: float | None = None
    on_time_rate: float | None = None


class DashboardOut(BaseModel):
    generated_at: datetime
    totals: DashboardTotals
    queues: list[QueueBucket]
    financials: dict[str, list[BreakdownItem]]
    cycle_times: list[CycleTimeItem]
    milestone_durations: list[MilestoneDuration]
    award_trend: list[AwardTrendItem]
    alerts: dict[str, list[AlertItem]]
    recent_activity: list[ActivityItem]
    top_contractors: list[ContractorDirectoryItem] = Field(default_factory=list)


class MyWorkItem(BaseModel):
    contract_id: int
    contract_no: str | None
    project_name: str | None
    status: str
    status_label: str
    owner_role: str | None
    amount_lkr: float | None = None
    updated_at: datetime
    action: str | None = None
    reason: str | None = None
    to_role: str | None = None


class MyWorkOut(BaseModel):
    ongoing: list[MyWorkItem]
    recent: list[MyWorkItem]


class PublicStats(BaseModel):
    total_contracts: int
    total_awarded_lkr: float
    completed_contracts: int
    contractors: int

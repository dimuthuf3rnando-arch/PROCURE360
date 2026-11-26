from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel


class HandoffOut(APIModel):
    id: int
    contract_id: int
    from_status: str | None
    to_status: str
    action: str
    from_role: str | None
    to_role: str | None
    acted_by_id: int | None
    acted_by_name: str | None = None
    reason: str | None
    is_admin_override: bool
    version_after: int
    created_at: datetime
    duration_in_previous_stage_hours: float | None = None


class AuditLogOut(APIModel):
    id: int
    contract_id: int
    contract_no: str | None = None
    project_name: str | None = None
    user_id: int | None
    user_name: str | None = None
    action: str
    field_name: str | None
    old_value: str | None
    new_value: str | None
    reason: str | None
    is_admin_override: bool
    changed_at: datetime


class AuditSummary(BaseModel):
    total_changes: int
    total_handoffs: int
    override_count: int
    return_count: int

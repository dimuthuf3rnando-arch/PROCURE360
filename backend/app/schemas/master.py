from datetime import datetime

from pydantic import BaseModel, Field

from app.models.enums import LookupType
from app.schemas.common import APIModel


class EvaluationTeamMemberOut(APIModel):
    id: int
    name: str
    designation: str | None
    display_order: int
    is_active: bool


class EvaluationTeamMemberCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    designation: str | None = Field(default=None, max_length=160)
    display_order: int = 0
    is_active: bool = True


class EvaluationTeamMemberUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=160)
    designation: str | None = Field(default=None, max_length=160)
    display_order: int | None = None
    is_active: bool | None = None


class LookupValueOut(APIModel):
    id: int
    list_type: str
    value: str
    sort_order: int
    is_active: bool


class LookupCreate(BaseModel):
    list_type: LookupType
    value: str = Field(min_length=1, max_length=160)
    sort_order: int = 0


class LookupUpdate(BaseModel):
    value: str | None = Field(default=None, min_length=1, max_length=160)
    sort_order: int | None = None
    is_active: bool | None = None


class LookupGroupsOut(BaseModel):
    category: list[str]
    priority: list[str]
    procurement_method: list[str]
    office_region: list[str]
    funds: list[str]


class MastersBundle(BaseModel):
    lookups: LookupGroupsOut
    evaluation_team: list[EvaluationTeamMemberOut]
    lookup_records: list[LookupValueOut]
    generated_at: datetime

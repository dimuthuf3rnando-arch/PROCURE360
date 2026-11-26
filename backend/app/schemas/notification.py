from datetime import datetime

from pydantic import BaseModel

from app.schemas.common import APIModel, Page


class NotificationOut(APIModel):
    id: int
    user_id: int
    contract_id: int | None = None
    actor_id: int | None = None
    actor_name: str | None = None
    contract_no: str | None = None
    project_name: str | None = None
    kind: str
    title: str
    body: str | None = None
    is_read: bool
    created_at: datetime
    read_at: datetime | None = None


class UnreadCount(BaseModel):
    count: int

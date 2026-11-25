import uuid

from pydantic import BaseModel

from app.models.org import OrgPlan, OrgStatus


class ServerHealthOut(BaseModel):
    cpu_percent: float
    ram_percent: float
    ram_used_mb: int
    ram_total_mb: int
    disk_percent: float
    disk_used_gb: float
    disk_total_gb: float


class OrgUsageOut(BaseModel):
    org_id: uuid.UUID
    org_name: str
    org_slug: str
    plan: OrgPlan
    status: OrgStatus
    user_count: int
    user_limit: int
    storage_mb: float
    storage_limit_mb: int
    storage_percent: float
    requests_today: int
    avg_response_ms: int
    active_users_today: int


class UsageSeriesPoint(BaseModel):
    date: str
    value: int


class StorageBreakdownItem(BaseModel):
    type: str
    bytes: int


class OrgUsageDetailOut(BaseModel):
    org_id: uuid.UUID
    org_name: str
    org_slug: str
    plan: OrgPlan
    status: OrgStatus
    user_count: int
    user_limit: int
    storage_mb: float
    storage_limit_mb: int
    storage_percent: float
    storage_breakdown: list[StorageBreakdownItem]
    dau_trend: list[UsageSeriesPoint]
    request_trend: list[UsageSeriesPoint]
    live_class_count: int
    live_class_minutes: int
    whatsapp_messages: int

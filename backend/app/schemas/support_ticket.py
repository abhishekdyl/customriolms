import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

SupportTicketCategory = Literal["query", "complaint", "technical", "billing", "other"]
SupportTicketPriority = Literal["low", "medium", "high", "urgent"]
SupportTicketStatus = Literal["open", "resolved"]


class SupportTicketIn(BaseModel):
    """What an Org Admin submits to open a new ticket — subject +
    opening message, filed as this ticket's first SupportTicketMessage
    row (see support_ticket_service.create_ticket)."""
    subject: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)
    category: SupportTicketCategory = "query"
    priority: SupportTicketPriority = "medium"


class SupportTicketStatusUpdate(BaseModel):
    status: SupportTicketStatus


class SupportTicketMessageIn(BaseModel):
    body: str = Field(min_length=1)


class SupportTicketMessageOut(BaseModel):
    id: uuid.UUID
    body: str
    author_name: str | None
    is_super_admin: bool
    created_at: datetime

    class Config:
        from_attributes = True


class SupportTicketOut(BaseModel):
    id: uuid.UUID
    subject: str
    category: SupportTicketCategory
    priority: SupportTicketPriority
    status: SupportTicketStatus
    raised_by_name: str | None
    message_count: int
    # Org context — populated for the Super Admin's cross-org queue;
    # an Org Admin viewing their own list already knows which org this
    # is, but these are harmless/cheap to include either way, so one
    # shape serves both views rather than two near-identical schemas.
    org_id: uuid.UUID
    org_name: str
    org_slug: str
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

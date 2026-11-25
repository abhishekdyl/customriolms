import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

# Plain strings, not DB enums — same cheap-migration reasoning used
# throughout this codebase (see Course.completion_mode's note):
# validated as a Literal at the API layer (schemas/support_ticket.py).
SUPPORT_TICKET_CATEGORIES = ["query", "complaint", "technical", "billing", "other"]
SUPPORT_TICKET_PRIORITIES = ["low", "medium", "high", "urgent"]
SUPPORT_TICKET_STATUSES = ["open", "resolved"]


class SupportTicket(Base):
    """An Org Admin's support conversation with the platform's Super
    Admin team — raised by an Org Admin only (never a Team Lead or a
    custom role; see support_ticket_service's permission check), read
    and replied to by any Super Admin across every org (there's no
    "assigned agent" concept — this is a small helpdesk, not a full
    ticketing system).

    status is deliberately just "open"/"resolved" (the user's own call,
    not a 4-state helpdesk workflow): a Super Admin marks it resolved,
    and it flips back to "open" automatically the moment the raising
    Org Admin posts another reply (see support_ticket_service.
    add_message) — no separate "reopen" action to remember to use.

    org_id is who it's ABOUT (the Org Admin's own org); raised_by_user_id
    is who filed it. Both are needed because an org can have more than
    one Org Admin, and the ticket should still show up in that org's
    own Support list for any of them, not just its original author."""
    __tablename__ = "support_tickets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    raised_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    category: Mapped[str] = mapped_column(String(20), default="query", nullable=False)
    priority: Mapped[str] = mapped_column(String(10), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(10), default="open", nullable=False, index=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )


class SupportTicketMessage(Base):
    """One message in a ticket's thread — the opening description is
    the first row (added in the same call that creates the ticket, so
    the ticket row itself carries no body text of its own), every
    reply after that another row. Flat, like CourseAnnouncementComment
    — no nesting."""
    __tablename__ = "support_ticket_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("support_tickets.id"), nullable=False, index=True)
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    body: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

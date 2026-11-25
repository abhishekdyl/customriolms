import uuid
from datetime import date

from sqlalchemy import Date, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AppActivityDay(Base):
    """One row per (user, calendar day) that user made an authenticated
    request — ANY role (Org Admin, Team Lead, Learner, Super Admin),
    unlike models/activity.py's ActivityDay which is learner-only and
    feeds the learner streak/badge system specifically. This is the
    "Active Today" signal on the Super Admin's Usage Monitoring page:
    how many distinct people actually used the product today, not just
    how many learners are keeping a streak alive.

    Written from the same best-effort request middleware that writes
    org_request_stats (see app/main.py + usage_monitoring_service.
    record_request) — org_id is denormalized onto this row (not just
    derivable via a join to users) so the per-org DAU query never has
    to join at all, same reasoning as AuditLog's denormalization."""
    __tablename__ = "app_activity_days"

    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)

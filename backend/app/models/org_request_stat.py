import uuid
from datetime import date

from sqlalchemy import BigInteger, Date, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class OrgRequestStat(Base):
    """One row per (org, calendar day) — the per-org "load" signal for
    the Super Admin's Usage Monitoring page: how many API requests this
    org generated today, how long they took on average, and how many
    errored. Written by a best-effort middleware (see app/main.py's
    request-stat hook and usage_monitoring_service.record_request), never
    by request handlers themselves.

    Deliberately NOT one row per request — that would be a full access
    log, a different (and much bigger) feature than "is this org
    generating unusual load". A day's row is incremented in place via an
    upsert every time a request from that org finishes, same spirit as
    ActivityDay's one-row-per-user-per-day shape.

    No FK relationship object is declared (same reasoning as AuditLog) —
    this is written on the hot path of every request, so it stays a
    plain indexed column, not something that pulls in a lazy-loaded
    Org object anywhere."""
    __tablename__ = "org_request_stats"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), primary_key=True)
    stat_date: Mapped[date] = mapped_column(Date, primary_key=True)

    request_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Sum of every request's duration this day — divide by request_count
    # when reading to get the average; storing the sum (not a running
    # average) is what makes the increment a single atomic upsert.
    total_duration_ms: Mapped[int] = mapped_column(BigInteger, default=0, nullable=False)
    error_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

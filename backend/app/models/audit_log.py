import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class AuditLog(Base):
    """One row per admin-meaningful write anywhere in the app — "who
    changed a course, graded an attempt, or edited a user's role" (see
    docs/project-structure.md's original TODO note on this file). Written
    by app.services.audit_log_service.record, never edited or deleted —
    an audit trail that could be rewritten isn't one.

    Deliberately denormalized (actor_name, entity_label) rather than pure
    foreign keys: a user or course can be renamed or deleted later, and
    the log must keep reading exactly as it did at the moment the action
    happened, not reflect whatever the referenced row says today. actor_id
    and entity_id stay as plain (unconstrained) UUID columns, not real FKs,
    for the same reason — a deleted user's past actions must stay in the
    log.
    """
    __tablename__ = "audit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)

    # Who did it — a snapshot, not a live FK (see docstring). actor_id is
    # null only for a system-triggered action with no human behind it
    # (none exist yet, but the column stays nullable for that case rather
    # than forcing a fake actor).
    actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    actor_name: Mapped[str] = mapped_column(String(200), nullable=False)

    # What happened — a short dot-namespaced code (e.g. "course.published",
    # "course.updated", "user.role_changed", "quiz_attempt.graded") so the
    # log can be filtered by action family without parsing `detail`'s free
    # text. See audit_log_service.record for the actions actually emitted.
    action: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    # What it happened to — same snapshot reasoning as actor_name above.
    entity_type: Mapped[str] = mapped_column(String(40), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    entity_label: Mapped[str] = mapped_column(String(300), nullable=False, default="")

    # Which course this happened under, when relevant — set on every
    # course.* row (equal to entity_id there) AND on every module.*
    # row (the module's *parent* course, since entity_id for those is
    # the module itself). Unconstrained UUID, same snapshot reasoning
    # as actor_id/entity_id — a deleted course's past log rows stay
    # put. Exists purely so a course's own "Activity" tab (see
    # audit_log_service.list_course_activity) can pull its full history
    # — course edits and every module edit under it — in one indexed
    # query, without entity_id alone being able to express "belongs to
    # this course" for a module-level row.
    course_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)

    # One human-readable line — "Published course \"Onboarding 2026\"",
    # "Changed role: LEARNER -> TEAM_LEAD" — built by the caller at the
    # moment of the action, not reconstructed later from before/after
    # columns. Keeps this table (and the admin-facing log view) simple;
    # a before/after diff can be added later as a separate JSONB column
    # if a specific action ever needs one.
    detail: Mapped[str] = mapped_column(Text, nullable=False, default="")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)

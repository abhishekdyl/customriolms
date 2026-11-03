import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseDueOverride(Base):
    """A per-(course, learner) exception to the course's own, shared
    `closes_at` — "THIS learner's personal due date on this course is
    different" without touching the window for everyone else. Same
    pattern as ModuleAttemptOverride (see its docstring): one row per
    (course_id, user_id), a later Set replaces the stored value rather
    than stacking rows, and `due_at = None` both means "no override" and
    is how an admin clears one back to the course's own default.

    Deliberately NOT a new "due date" concept bolted onto Course itself —
    the course's existing `closes_at` already IS the default due date
    (see Course's own docstring: "a hard enrollment/completion cutoff"),
    so this table only needs to hold the learners whose due date
    deliberately differs from that default (an extension, or a stricter
    internal deadline). The calendar/due-date view (course_service's
    effective_due_map) folds the two together: this row's due_at if one
    exists for that learner, else the course's own closes_at, else None
    (an open-ended course has no due date for anyone)."""
    __tablename__ = "course_due_overrides"
    __table_args__ = (UniqueConstraint("course_id", "user_id", name="uq_due_override_course_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

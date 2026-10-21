import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ScormProgress(Base):
    """A SCORM module's in-progress state for one learner — the exact
    mirror of WatchProgress, but for a SCORM package instead of a video.

    SCORM content calls LMSCommit/Commit continuously while it runs (not
    just once at the end), each time handing over its own full CMI data
    model as key -> string value (cmi.core.lesson_location,
    cmi.suspend_data, cmi.core.score.raw, ...). This table persists that
    whole blob so reopening the module (a reload, a new tab, or a fresh
    login) can seed the package's own JS API with exactly what it last
    saw, and the package's own internal resume logic (reading
    cmi.suspend_data / cmi.core.lesson_location back out on
    LMSInitialize) takes it from there — the LMS doesn't need to
    understand what's inside suspend_data, only to give it back intact.

    One row per (user_id, module_id), mutated in place while an attempt
    is ongoing — same "running state survives a reload" idea as
    WatchProgress.furthest_pct/answers_json, just storing the package's
    own CMI dict wholesale instead of LMS-specific fields, since SCORM
    content (unlike an in-video question) owns its own data model and
    the LMS only needs to echo it back.

    attempt_number increments only on an explicit retake (see
    learn_service.retake_scorm_module) — same non-load-bearing-for-scoring
    role as WatchProgress.attempt_number (QuizAttempt rows are still the
    permanent per-attempt history, see learn_service.complete_module's
    SCORM branch); it just disambiguates which round cmi_data belongs to.

    A retake clears cmi_data back to {} — the learner's previous
    (finished) attempt is already safely recorded as a QuizAttempt row
    before that happens, so nothing is lost, only reset for the next
    round, same as WatchProgress's retake."""
    __tablename__ = "scorm_progress"
    __table_args__ = (UniqueConstraint("user_id", "module_id", name="uq_scorm_progress_user_module"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    cmi_data: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

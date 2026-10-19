import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class WatchProgress(Base):
    """A WATCH module's in-progress state for one learner — what lets
    re-opening the module (a reload, a new tab, or a fresh login after
    logging out) resume exactly where they left off instead of starting
    over, and never re-ask an in-video question they already answered
    this attempt.

    One row per (user_id, module_id), mutated in place while an attempt
    is ongoing:
      - furthest_pct tracks the farthest point actually reached in the
        video (same "running max, not wherever playback currently sits"
        idea the frontend's own maxReachedRef already uses — this is
        just that same number surviving a reload instead of resetting to
        0) so the player can seek there and skip asking any question
        whose trigger time already passed.
      - answers_json is every in-video question answered so far THIS
        attempt, keyed by question_id (str) -> {"option_id": ..|None,
        "text": ..|None} — a learner who reloads mid-video gets those
        skipped on replay (see learn_service.complete_module), and this
        is also exactly what the final gate-check scores against, not
        whatever the client happens to have in memory when they click
        "Mark complete".
      - attempt_number increments only on an explicit retake (see
        learn_service.retake_watch_module) — it isn't load-bearing for
        scoring (QuizAttempt rows, not this row, are the permanent
        history Of each finished attempt, same as a QUIZ module), it
        just disambiguates which round furthest_pct/answers_json belong
        to for anyone inspecting the row directly.

    A retake clears furthest_pct back to 0 and answers_json back to {} —
    the learner's previous (finished) attempt is already safely recorded
    as a QuizAttempt row before that happens, so nothing is lost, only
    reset for the next round."""
    __tablename__ = "watch_progress"
    __table_args__ = (UniqueConstraint("user_id", "module_id", name="uq_watch_progress_user_module"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    attempt_number: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    furthest_pct: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    answers_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

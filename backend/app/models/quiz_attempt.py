import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class QuizAttempt(Base):
    """Every submission of a quiz module, passed or not — backs the
    'perfect scores' badge, the per-attempt history, and the Org
    Admin/Team Lead "quiz submissions" review (what a learner actually
    answered, right or wrong, on every attempt they made).

    answers_json is a snapshot taken at submit time (question text/type,
    the options as they stood then, what was picked, whether it was
    correct) — not a live join back to module_quiz_questions, so editing
    or deleting a question later never changes what a past attempt shows.
    `passed` is likewise fixed to the module's threshold at submit time,
    for the same reason."""
    __tablename__ = "quiz_attempts"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    score: Mapped[int] = mapped_column(Integer, nullable=False)  # percent
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    # Raw marks, alongside the already-existing percent `score` — "earned
    # 7/10 marks" is what an Org Admin actually wants to see, not just
    # "70%". Nullable because an attempt scored before this existed has
    # no per-question points recorded to recompute these from.
    earned_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    total_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    answers_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseRating(Base):
    """One row per (course, learner) — a 1-5 star rating, submitted once
    the learner has completed the course's first module (see
    course_rating_service.can_rate). Resubmitting updates this same
    row (see the unique constraint below) rather than adding a new one,
    so a learner's rating is always their latest opinion, not a growing
    history.

    review_text is required when rating < 4 (asking "what went wrong"
    only when something likely did) and optional at 4-5 stars — see
    schemas/course_rating.py's validator for the exact rule.

    Who can moderate (edit/delete) someone else's row here is NOT a
    property of this table — see course_rating_service.can_moderate:
    Org Admin, or this course's own creator (Course.created_by)."""
    __tablename__ = "course_ratings"
    __table_args__ = (UniqueConstraint("course_id", "user_id", name="uq_course_ratings_course_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    rating: Mapped[int] = mapped_column(Integer, nullable=False)  # 1-5
    review_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

import enum
import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class BadgeCriteria(str, enum.Enum):
    STREAK = "streak"                      # value = number of consecutive login days
    CATEGORY_COMPLETE = "category_complete"  # value = a Category name
    PERFECT_SCORES = "perfect_scores"      # value = count of 100%-score quiz attempts
    TEAM_RANK_PCT = "team_rank_pct"        # value = top N% of team, by leaderboard points
    COURSE_COMPLETE = "course_complete"    # value = a Course id — awarded for finishing that specific course


class Badge(Base):
    """
    A recognition badge, awarded either org-wide by criteria (streak,
    perfect scores, ...) or per-course (COURSE_COMPLETE, referenced from
    Course.badge_ids / Module.badge_ids as a soft reference — see those
    files' notes).

    `value` is a plain string rather than a typed column because its
    meaning depends on `criteria`: a day count, a Category name, or a
    Course id. Validate the shape at the API layer per criteria type,
    not in the schema.

    Actually AWARDING a badge to a learner — evaluating these criteria
    against real activity — has no home yet: it needs Enrollment and
    QUIZ_ATTEMPT data that doesn't exist. This table is only the
    definition side (what badges exist, what they're supposed to mean),
    same scope boundary as Skill.
    """
    __tablename__ = "badges"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    criteria: Mapped[BadgeCriteria] = mapped_column(default=BadgeCriteria.STREAK)
    value: Mapped[str] = mapped_column(String(200), nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#3D5AFE")

    org: Mapped["Org"] = relationship()

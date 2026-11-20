import enum
import uuid

from sqlalchemy import ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PointEvent(str, enum.Enum):
    MODULE_COMPLETE = "module_complete"  # any one module finished (any ModuleType, incl. SCORM) — course_id unset
    COURSE_COMPLETE = "course_complete"  # a course's certificate issued — module_id unset


class PointRule(Base):
    """
    An Org Admin's override of how many leaderboard points one event is
    worth, for one specific course or module — e.g. "Course One complete
    = 50 pts" (event=COURSE_COMPLETE, course_id=<Course One>'s id) or
    "this SCORM module in Course Two = 25 pts" (event=MODULE_COMPLETE,
    module_id=<that module>'s id).

    Exactly one of course_id/module_id is set, matching `event`
    (enforced at the API layer, same convention as Badge.value's
    per-criteria shape). `course_id`/`module_id` are each unique (NULLs
    don't count towards a unique index in Postgres, so many rows can
    share NULL in the column they don't use) — one override per
    course, one per module, so "set this course's points" is a plain
    upsert keyed on course_id/module_id, not a list to de-duplicate.

    Anything with no row here falls back to the org's own
    default_module_points / default_course_points (see Org model) — see
    learn_service.points_by_user for how the two combine into each
    learner's total.
    """
    __tablename__ = "point_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    event: Mapped[PointEvent] = mapped_column(nullable=False)
    course_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True, unique=True)
    module_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=True, unique=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False)

    org: Mapped["Org"] = relationship()

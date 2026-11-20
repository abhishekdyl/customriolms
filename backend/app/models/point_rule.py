import enum
import uuid

from sqlalchemy import ForeignKey, Index, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RuleScope(str, enum.Enum):
    COURSE = "course"  # the whole course's certificate — module_id unset
    MODULE = "module"  # one specific activity/module — course_id unset, course looked up via module_id


class RuleEvent(str, enum.Enum):
    START = "start"       # the learner opened/launched it — only meaningful for WATCH/SCORM (see learn_service)
    COMPLETE = "complete"  # the learner finished it (= certificate issued, for COURSE scope)


class PointRule(Base):
    """
    An Org Admin's override of how many leaderboard points one event is
    worth, for one specific course or one specific module/activity —
    the "Points Rules" section of the Recognition page's Leaderboard
    tab. E.g. "Course One complete = 50 pts" (scope=COURSE,
    course_id=<Course One>'s id, event=COMPLETE) or "this SCORM module
    in Course Two, on complete = 25 pts" (scope=MODULE,
    module_id=<that module>'s id, event=COMPLETE).

    One row per (scope, course_id/module_id, event) — enforced by the
    two partial unique indexes below (Postgres unique indexes treat
    NULL as distinct from NULL, so a plain unique(course_id, event)
    would let many module-scoped rows with course_id=NULL collide as
    "equal"; WHERE ... IS NOT NULL avoids that). The API upserts on
    this same key rather than erroring on a duplicate, so re-submitting
    the form for an activity/event you already set just updates it.

    START only fires for WATCH/SCORM modules (see
    learn_service.points_by_user for why — those are the only module
    types with a persisted "in progress, not finished yet" row to key
    off of); the API rejects scope=MODULE/event=START for any other
    ModuleType, and scope=COURSE never allows event=START at all (this
    app has no notion of a course being "started" independent of its
    first module).

    A course/module with no row here falls back to the org's own
    default_module_points / default_course_points (see Org model) —
    never a default for START, since that's a purely opt-in bonus.
    """
    __tablename__ = "point_rules"
    __table_args__ = (
        Index("ux_point_rules_course_event", "course_id", "event", unique=True, postgresql_where="course_id IS NOT NULL"),
        Index("ux_point_rules_module_event", "module_id", "event", unique=True, postgresql_where="module_id IS NOT NULL"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    scope: Mapped[RuleScope] = mapped_column(nullable=False)
    event: Mapped[RuleEvent] = mapped_column(nullable=False)
    course_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True)
    module_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=True)
    points: Mapped[int] = mapped_column(Integer, nullable=False)

    org: Mapped["Org"] = relationship()

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CourseGroup(Base):
    """A course-scoped sub-group of enrolled learners — e.g. "Batch A",
    "Morning cohort" — distinct from an org-wide Team (which is what a
    course gets ASSIGNED to; see Course.assigned_team_ids). A group only
    exists inside the one course it belongs to, and is used for three
    things:

    1. Organizing/reporting: the admin's Participants/Gradebook/Progress
       views can be filtered down to one group's members.
    2. Gating content: a module's own restrictions (see
       ModuleRestrictionIn) can include a "group" restriction, so only
       this group's members can reach that module.
    3. A group-wide due date (due_at) — applies to every member who
       doesn't already have their own personal CourseDueOverride, which
       still wins when both are set. See
       course_service._effective_due for the precedence.

    member_user_ids is a soft reference (no join table), same convention
    as Course.assigned_user_ids/assigned_team_ids — validated at the API
    layer, not via a real FK per element.
    """
    __tablename__ = "course_groups"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    member_user_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    # Optional group-wide due date — see the class docstring's point 3.
    # Null means this group doesn't change anyone's due date at all.
    due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    course: Mapped["Course"] = relationship(back_populates="groups")

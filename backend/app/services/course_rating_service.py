"""Course ratings & reviews.

Eligibility (can_rate): enrolled in the course (same assigned_user_ids/
assigned_team_ids check used everywhere else) AND has completed the
course's first module (lowest Module.position) — not "enrolled", not
"fully completed the course", specifically the first module, per this
feature's own scope.

Moderation (can_moderate): Org/Super Admin, or the course's own
creator (Course.created_by) — nobody else, not even a Team Lead with
courses.manage, matches this feature's own scope (vs. course CRUD
itself, which is the broader courses.manage capability).
"""
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.course_rating import CourseRating
from app.models.module import Module
from app.models.module_progress import ModuleProgress
from app.models.user import RoleName, User
from app.schemas.course_rating import CourseRatingSummary


def is_enrolled(course: Course, user: User) -> bool:
    via_direct = user.id in (course.assigned_user_ids or [])
    via_team = user.team_id is not None and user.team_id in (course.assigned_team_ids or [])
    return via_direct or via_team


async def _first_module_id(db: AsyncSession, course_id: uuid.UUID) -> uuid.UUID | None:
    row = (await db.execute(
        select(Module.id).where(Module.course_id == course_id).order_by(Module.position.asc(), Module.id.asc()).limit(1)
    )).scalar_one_or_none()
    return row


async def can_rate(db: AsyncSession, course: Course, user: User) -> tuple[bool, str | None]:
    """Returns (ok, reason_if_not) — the reason is what the 400 tells
    the learner, so it's written for them, not for a log."""
    if not is_enrolled(course, user):
        return False, "You need to be enrolled in this course to rate it"
    first_module_id = await _first_module_id(db, course.id)
    if first_module_id is None:
        return False, "This course doesn't have any modules yet"
    done = (await db.execute(
        select(ModuleProgress.id).where(ModuleProgress.user_id == user.id, ModuleProgress.module_id == first_module_id)
    )).scalar_one_or_none()
    if done is None:
        return False, "Complete the first module before rating this course"
    return True, None


def can_moderate(course: Course, user: User) -> bool:
    if user.role in (RoleName.SUPER_ADMIN, RoleName.ORG_ADMIN):
        return True
    return course.created_by is not None and course.created_by == user.id


async def summary(db: AsyncSession, course_id: uuid.UUID) -> CourseRatingSummary:
    rows = (await db.execute(
        select(CourseRating.rating, func.count()).where(CourseRating.course_id == course_id).group_by(CourseRating.rating)
    )).all()
    distribution = {n: 0 for n in range(1, 6)}
    total = 0
    weighted = 0
    for rating, count in rows:
        distribution[rating] = count
        total += count
        weighted += rating * count
    average = round(weighted / total, 2) if total else None
    return CourseRatingSummary(average=average, count=total, distribution=distribution)

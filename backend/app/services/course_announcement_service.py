"""Course announcements — see models/course_announcement.py for the
full design note. This module is deliberately thin: permission check,
the default-seed helper, and turning a row (+ its author) into the
API's CourseAnnouncementOut shape.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.course_announcement import CourseAnnouncement
from app.models.user import User
from app.schemas.course_announcement import CourseAnnouncementOut
from app.services.course_rating_service import can_moderate

# Same population as course_rating_service.can_moderate (Org/Super
# Admin, or one of this course's own Teachers) — reused rather than
# reimplemented, see the model's docstring.
can_manage = can_moderate

DEFAULT_TITLE = "Welcome"
DEFAULT_BODY = "Welcome to this course! Check back here for important updates from your instructor."


async def seed_default(db: AsyncSession, course: Course, author_user_id: uuid.UUID | None) -> CourseAnnouncement:
    """Called once, right after a course is created (see
    POST /courses), so every course starts with one announcement
    instead of an empty board. Adds the row but doesn't commit —
    the caller's own commit (right after creating the course) covers
    it, same as course_service's other seed-on-create helpers."""
    row = CourseAnnouncement(
        org_id=course.org_id, course_id=course.id, author_user_id=author_user_id,
        title=DEFAULT_TITLE, body=DEFAULT_BODY,
    )
    db.add(row)
    return row


async def _author_name(db: AsyncSession, author_user_id: uuid.UUID | None) -> str | None:
    if author_user_id is None:
        return None
    user = await db.get(User, author_user_id)
    return f"{user.firstname} {user.lastname}".strip() if user else None


async def to_out(db: AsyncSession, row: CourseAnnouncement) -> CourseAnnouncementOut:
    return CourseAnnouncementOut(
        id=row.id, title=row.title, body=row.body, is_hidden=row.is_hidden,
        author_name=await _author_name(db, row.author_user_id),
        created_at=row.created_at, updated_at=row.updated_at,
    )


async def list_for(db: AsyncSession, course_id: uuid.UUID, include_hidden: bool) -> list[CourseAnnouncementOut]:
    stmt = select(CourseAnnouncement).where(CourseAnnouncement.course_id == course_id)
    if not include_hidden:
        stmt = stmt.where(CourseAnnouncement.is_hidden.is_(False))
    stmt = stmt.order_by(CourseAnnouncement.created_at.desc())
    rows = (await db.execute(stmt)).scalars().all()
    # Resolve author names in one pass rather than one query per row.
    author_ids = {r.author_user_id for r in rows if r.author_user_id is not None}
    authors: dict[uuid.UUID, User] = {}
    if author_ids:
        users = (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
        authors = {u.id: u for u in users}
    out = []
    for r in rows:
        author = authors.get(r.author_user_id) if r.author_user_id else None
        out.append(CourseAnnouncementOut(
            id=r.id, title=r.title, body=r.body, is_hidden=r.is_hidden,
            author_name=f"{author.firstname} {author.lastname}".strip() if author else None,
            created_at=r.created_at, updated_at=r.updated_at,
        ))
    return out

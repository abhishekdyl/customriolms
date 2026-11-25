"""An announcement's own discussion thread — see
models/course_announcement.py's CourseAnnouncementComment docstring for
who can view/post/delete. Deliberately as thin as course_announcement_
service.py: permission reuse + row-to-API-shape conversion.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.course_announcement import CourseAnnouncementComment
from app.models.user import RoleName, User
from app.schemas.course_announcement import CourseAnnouncementCommentOut
from app.services.course_announcement_service import can_manage
from app.services.course_rating_service import is_enrolled

# Viewing and posting both require the same population as
# course_rating_service.is_enrolled — an enrolled learner, this
# course's own Teacher, or an Org/Super Admin (is_enrolled's own
# definition already covers the latter two) — deliberately narrower
# than who can read the announcement LIST itself (any org member),
# because a discussion thread is scoped to the people this course is
# actually for, not every org member who can browse the catalog.
can_participate = is_enrolled


def _is_manager_now(course: Course, user: User) -> bool:
    return user.role in (RoleName.SUPER_ADMIN, RoleName.ORG_ADMIN) or user.id in (course.teacher_user_ids or [])


async def _to_out(db: AsyncSession, row: CourseAnnouncementComment, course: Course) -> CourseAnnouncementCommentOut:
    author = await db.get(User, row.author_user_id) if row.author_user_id else None
    return CourseAnnouncementCommentOut(
        id=row.id, body=row.body,
        author_name=f"{author.firstname} {author.lastname}".strip() if author else None,
        is_manager=_is_manager_now(course, author) if author else False,
        created_at=row.created_at,
    )


async def list_comments(db: AsyncSession, announcement_id: uuid.UUID, course: Course) -> list[CourseAnnouncementCommentOut]:
    rows = (await db.execute(
        select(CourseAnnouncementComment)
        .where(CourseAnnouncementComment.announcement_id == announcement_id)
        .order_by(CourseAnnouncementComment.created_at.asc())
    )).scalars().all()
    # Resolve authors in one pass rather than one query per row.
    author_ids = {r.author_user_id for r in rows if r.author_user_id is not None}
    authors: dict[uuid.UUID, User] = {}
    if author_ids:
        users = (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
        authors = {u.id: u for u in users}
    out = []
    for r in rows:
        author = authors.get(r.author_user_id) if r.author_user_id else None
        out.append(CourseAnnouncementCommentOut(
            id=r.id, body=r.body,
            author_name=f"{author.firstname} {author.lastname}".strip() if author else None,
            is_manager=_is_manager_now(course, author) if author else False,
            created_at=r.created_at,
        ))
    return out


async def create_comment(
    db: AsyncSession, org_id: uuid.UUID, announcement_id: uuid.UUID, author: User, body: str, course: Course,
) -> CourseAnnouncementCommentOut:
    row = CourseAnnouncementComment(org_id=org_id, announcement_id=announcement_id, author_user_id=author.id, body=body.strip())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await _to_out(db, row, course)

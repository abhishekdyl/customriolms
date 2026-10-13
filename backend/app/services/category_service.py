import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.category import Category
from app.models.course import Course

UNCATEGORIZED = "Uncategorized"


async def list_categories_with_counts(db: AsyncSession, org_id: uuid.UUID) -> list[tuple[Category, int]]:
    result = await db.execute(
        select(Category, func.count(Course.id).label("course_count"))
        .outerjoin(Course, Course.category_id == Category.id)
        .where(Category.org_id == org_id)
        .group_by(Category.id)
    )
    return result.all()


async def delete_category(db: AsyncSession, category: Category) -> None:
    """
    Courses tagged with this category are never deleted or left dangling —
    they fall back to Uncategorized, exactly like the admin UI's
    CategoryManager already promises in its confirm-delete warning.
    """
    result = await db.execute(select(Course).where(Course.category_id == category.id))
    for course in result.scalars().all():
        course.category_id = None  # NULL category_id renders as "Uncategorized" in the API response
    await db.delete(category)
    await db.commit()

import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.badge import Badge
from app.services.course_service import strip_badge_references


async def get_badge_or_404(db: AsyncSession, badge_id: uuid.UUID, org_id: uuid.UUID) -> Badge:
    result = await db.execute(select(Badge).where(Badge.id == badge_id, Badge.org_id == org_id))
    badge = result.scalar_one_or_none()
    if badge is None:
        raise HTTPException(status_code=404, detail="Badge not found")
    return badge


async def delete_badge(db: AsyncSession, badge: Badge) -> None:
    """Unlike Skill, badges the learner already earned aren't tracked yet (no award pipeline exists —
    see Badge model's note), so there's no "keep it for people who have it" case to preserve here."""
    await strip_badge_references(db, badge.id, badge.org_id)
    await db.delete(badge)
    await db.commit()

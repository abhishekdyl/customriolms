import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.module import Module
from app.models.skill import Skill
from app.services.course_service import strip_skill_references


async def list_skills_with_counts(db: AsyncSession, org_id: uuid.UUID) -> list[tuple[Skill, int]]:
    result = await db.execute(select(Skill).where(Skill.org_id == org_id))
    skills = result.scalars().all()

    # Array-membership counts are done in Python, not SQL, since counting
    # "modules where skill_id is any of skill_ids" per-skill is one extra
    # query each either way — fine at this scale, revisit if it isn't.
    counts = []
    for skill in skills:
        count_result = await db.execute(
            select(func.count(Module.id)).join(Course).where(Course.org_id == org_id, Module.skill_ids.any(skill.id))
        )
        counts.append((skill, count_result.scalar() or 0))
    return counts


async def get_skill_or_404(db: AsyncSession, skill_id: uuid.UUID, org_id: uuid.UUID) -> Skill:
    result = await db.execute(select(Skill).where(Skill.id == skill_id, Skill.org_id == org_id))
    skill = result.scalar_one_or_none()
    if skill is None:
        raise HTTPException(status_code=404, detail="Skill not found")
    return skill


async def delete_skill(db: AsyncSession, skill: Skill) -> None:
    await strip_skill_references(db, skill.id, skill.org_id)
    await db.delete(skill)
    await db.commit()

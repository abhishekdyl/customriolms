import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.skill import Skill
from app.models.user import RoleName, User
from app.schemas.skill import SkillCreate, SkillOut, SkillUpdate
from app.services.skill_service import delete_skill, get_skill_or_404, list_skills_with_counts

router = APIRouter(prefix="/api/v1/skills", tags=["skills"])


@router.get("", response_model=list[SkillOut], dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def list_skills(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await list_skills_with_counts(db, current_user.org_id)
    return [SkillOut(id=s.id, name=s.name, module_count=count) for s, count in rows]


@router.post("", response_model=SkillOut, status_code=201, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def create_skill(body: SkillCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    skill = Skill(org_id=current_user.org_id, name=body.name)
    db.add(skill)
    await db.commit()
    await db.refresh(skill)
    return SkillOut(id=skill.id, name=skill.name, module_count=0)


@router.patch("/{skill_id}", response_model=SkillOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def rename_skill(skill_id: uuid.UUID, body: SkillUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    skill = await get_skill_or_404(db, skill_id, current_user.org_id)
    skill.name = body.name
    await db.commit()
    return SkillOut(id=skill.id, name=skill.name)


@router.delete("/{skill_id}", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def remove_skill(skill_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    skill = await get_skill_or_404(db, skill_id, current_user.org_id)
    await delete_skill(db, skill)  # strips this skill_id from every module that had it

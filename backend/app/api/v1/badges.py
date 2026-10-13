import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.badge import Badge
from app.models.user import RoleName, User
from app.schemas.badge import BadgeCreate, BadgeOut, BadgeUpdate
from app.services.badge_service import delete_badge, get_badge_or_404

router = APIRouter(prefix="/api/v1/badges", tags=["badges"])


@router.get("", response_model=list[BadgeOut], dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def list_badges(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(Badge).where(Badge.org_id == current_user.org_id))
    return result.scalars().all()


@router.post("", response_model=BadgeOut, status_code=201, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def create_badge(body: BadgeCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    badge = Badge(org_id=current_user.org_id, **body.model_dump())
    db.add(badge)
    await db.commit()
    await db.refresh(badge)
    return badge


@router.patch("/{badge_id}", response_model=BadgeOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def update_badge(badge_id: uuid.UUID, body: BadgeUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    badge = await get_badge_or_404(db, badge_id, current_user.org_id)
    for key, value in body.model_dump().items():
        setattr(badge, key, value)
    await db.commit()
    await db.refresh(badge)
    return badge


@router.delete("/{badge_id}", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def remove_badge(badge_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    badge = await get_badge_or_404(db, badge_id, current_user.org_id)
    await delete_badge(db, badge)

import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_capability
from app.core.database import get_db
from app.models.point_level import PointLevel
from app.models.user import User
from app.schemas.point_level import PointLevelCreate, PointLevelOut
from app.services import storage_service

router = APIRouter(prefix="/api/v1/point-levels", tags=["point-levels"])

manage_only = [Depends(require_capability("leaderboard.manage"))]


async def _get_level_or_404(db: AsyncSession, level_id: uuid.UUID, org_id: uuid.UUID) -> PointLevel:
    level = (await db.execute(select(PointLevel).where(PointLevel.id == level_id, PointLevel.org_id == org_id))).scalar_one_or_none()
    if level is None:
        raise HTTPException(status_code=404, detail="Level not found")
    return level


@router.get("", response_model=list[PointLevelOut])
async def list_levels(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Any org member can read these — the leaderboard's tier chips/filter
    (both the admin's Recognition page and a learner's own Progress page)
    need this list, not just whoever can edit it."""
    rows = (await db.execute(
        select(PointLevel).where(PointLevel.org_id == current_user.org_id).order_by(PointLevel.sort_order, PointLevel.min_points)
    )).scalars().all()
    return rows


@router.post("", response_model=PointLevelOut, status_code=201, dependencies=manage_only)
async def create_level(body: PointLevelCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    level = PointLevel(org_id=current_user.org_id, **body.model_dump())
    db.add(level)
    await db.commit()
    await db.refresh(level)
    return level


@router.patch("/{level_id}", response_model=PointLevelOut, dependencies=manage_only)
async def update_level(level_id: uuid.UUID, body: PointLevelCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    level = await _get_level_or_404(db, level_id, current_user.org_id)
    for key, value in body.model_dump().items():
        setattr(level, key, value)
    await db.commit()
    await db.refresh(level)
    return level


@router.delete("/{level_id}", status_code=204, dependencies=manage_only)
async def delete_level(level_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    level = await _get_level_or_404(db, level_id, current_user.org_id)
    had_image = bool(level.image_key)
    await db.delete(level)
    await db.commit()
    if had_image:
        await storage_service.delete_file_ref(db, component="point_level", filearea="image", itemid=level_id)
        await db.commit()


@router.post("/{level_id}/image", response_model=PointLevelOut, dependencies=manage_only)
async def upload_level_image(
    level_id: uuid.UUID, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    level = await _get_level_or_404(db, level_id, current_user.org_id)
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    storage_service.validate_image_upload(file, size)
    record = await storage_service.store_file(
        db, file, org_id=current_user.org_id, component="point_level", filearea="image",
        itemid=level.id, user=current_user,
    )
    level.image_key = storage_service.file_key(record)
    await db.commit()
    await db.refresh(level)
    return level


@router.delete("/{level_id}/image", status_code=204, dependencies=manage_only)
async def remove_level_image(level_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    level = await _get_level_or_404(db, level_id, current_user.org_id)
    had_image = bool(level.image_key)
    level.image_key = None
    await db.commit()
    if had_image:
        await storage_service.delete_file_ref(db, component="point_level", filearea="image", itemid=level.id)
        await db.commit()

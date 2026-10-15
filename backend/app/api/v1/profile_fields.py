import uuid

from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import RoleName, User
from app.schemas.profile_field import ProfileFieldCreate, ProfileFieldOut, ProfileFieldUpdate
from app.services import profile_field_service as svc
from sqlalchemy.ext.asyncio import AsyncSession

router = APIRouter(
    prefix="/api/v1/org-profile-fields", tags=["org-profile-fields"],
    dependencies=[Depends(require_role(RoleName.ORG_ADMIN))],
)


@router.get("", response_model=list[ProfileFieldOut])
async def list_fields(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await svc.list_fields(db, current_user.org_id)


@router.post("", response_model=ProfileFieldOut, status_code=201)
async def create_field(body: ProfileFieldCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await svc.create_field(db, current_user.org_id, body)


@router.patch("/{field_id}", response_model=ProfileFieldOut)
async def update_field(
    field_id: uuid.UUID, body: ProfileFieldUpdate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    field = await svc.get_field_or_404(db, field_id, current_user.org_id)
    return await svc.update_field(db, field, body)


@router.delete("/{field_id}", status_code=204)
async def delete_field(field_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    field = await svc.get_field_or_404(db, field_id, current_user.org_id)
    await svc.delete_field(db, field)

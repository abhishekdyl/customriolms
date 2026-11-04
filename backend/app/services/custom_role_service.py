import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.custom_role import CustomRole
from app.models.user import User
from app.schemas.custom_role import CustomRoleIn, CustomRoleOut, CustomRoleUpdate
from app.services.permission_service import validate_capabilities


async def _role_out(db: AsyncSession, role: CustomRole) -> CustomRoleOut:
    count = (await db.execute(
        select(func.count(User.id)).where(User.custom_role_id == role.id)
    )).scalar_one()
    out = CustomRoleOut.model_validate(role)
    out.user_count = count
    return out


async def list_custom_roles(db: AsyncSession, org_id: uuid.UUID) -> list[CustomRoleOut]:
    result = await db.execute(select(CustomRole).where(CustomRole.org_id == org_id).order_by(CustomRole.name))
    roles = result.scalars().all()
    return [await _role_out(db, r) for r in roles]


async def get_custom_role_or_404(db: AsyncSession, role_id: uuid.UUID, org_id: uuid.UUID) -> CustomRole:
    result = await db.execute(select(CustomRole).where(CustomRole.id == role_id, CustomRole.org_id == org_id))
    role = result.scalar_one_or_none()
    if role is None:
        raise HTTPException(status_code=404, detail="Role not found")
    return role


async def create_custom_role(db: AsyncSession, org_id: uuid.UUID, body: CustomRoleIn) -> CustomRoleOut:
    try:
        capabilities = validate_capabilities(body.capabilities)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    role = CustomRole(org_id=org_id, name=body.name, description=body.description, scope=body.scope, capabilities=capabilities)
    db.add(role)
    await db.commit()
    await db.refresh(role)
    return await _role_out(db, role)


async def update_custom_role(db: AsyncSession, role: CustomRole, body: CustomRoleUpdate) -> CustomRoleOut:
    data = body.model_dump(exclude_unset=True)
    if "capabilities" in data:
        try:
            data["capabilities"] = validate_capabilities(data["capabilities"])
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))
    for key, value in data.items():
        setattr(role, key, value)
    await db.commit()
    await db.refresh(role)
    return await _role_out(db, role)


async def delete_custom_role(db: AsyncSession, role: CustomRole) -> None:
    # Block, don't silently reassign — unlike a team or category
    # disappearing (which has an obvious safe fallback: no team,
    # "Uncategorized"), there's no safe default permission level to fall
    # a user back to automatically. The admin must move them to another
    # role first, same spirit as the "can't delete, X depends on it"
    # guards elsewhere in this app.
    in_use = (await db.execute(
        select(func.count(User.id)).where(User.custom_role_id == role.id)
    )).scalar_one()
    if in_use:
        raise HTTPException(
            status_code=400,
            detail=f"{in_use} user{'s' if in_use != 1 else ''} still {'have' if in_use != 1 else 'has'} this role — reassign them first",
        )
    await db.delete(role)
    await db.commit()

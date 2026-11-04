import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import RoleName, User
from app.schemas.custom_role import CapabilityGroupOut, CapabilityOut, CustomRoleIn, CustomRoleOut, CustomRoleUpdate
from app.services import audit_log_service, custom_role_service
from app.services.permission_service import CAPABILITY_CATALOG

# Defining roles — deciding what a role CAN grant — is reserved to the
# fixed Org Admin role itself (require_role, not require_capability): a
# custom role granting "manage custom roles" to itself would be a
# privilege-escalation path, and the org already chose to keep the
# built-in roles (including who can define new ones) fixed. Same
# reasoning as Moodle restricting "Define roles" to a site-level
# capability rather than letting it be delegated arbitrarily.
router = APIRouter(
    prefix="/api/v1/custom-roles", tags=["custom-roles"],
    dependencies=[Depends(require_role(RoleName.ORG_ADMIN))],
)


@router.get("/capabilities", response_model=list[CapabilityGroupOut])
async def get_capability_catalog():
    """The full, fixed catalog a custom role's capabilities are picked
    from — backs the "Define role" checkbox list. Doesn't change per org."""
    return [
        CapabilityGroupOut(group=group, capabilities=[CapabilityOut(key=k, label=label) for k, label in caps])
        for group, caps in CAPABILITY_CATALOG.items()
    ]


@router.get("", response_model=list[CustomRoleOut])
async def list_roles(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await custom_role_service.list_custom_roles(db, current_user.org_id)


@router.post("", response_model=CustomRoleOut, status_code=201)
async def create_role(body: CustomRoleIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    role = await custom_role_service.create_custom_role(db, current_user.org_id, body)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="role.created",
        entity_type="custom_role", entity_id=role.id, entity_label=role.name,
        detail=f"Created role \"{role.name}\" ({len(role.capabilities)} capabilities, {role.scope} scope)",
    )
    return role


@router.patch("/{role_id}", response_model=CustomRoleOut)
async def update_role(
    role_id: uuid.UUID, body: CustomRoleUpdate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    role = await custom_role_service.get_custom_role_or_404(db, role_id, current_user.org_id)
    name_before = role.name
    updated = await custom_role_service.update_custom_role(db, role, body)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="role.updated",
        entity_type="custom_role", entity_id=role_id, entity_label=updated.name,
        detail=f"Updated role \"{name_before}\": {', '.join(sorted(body.model_dump(exclude_unset=True)))}",
    )
    return updated


@router.delete("/{role_id}", status_code=204)
async def delete_role(role_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    role = await custom_role_service.get_custom_role_or_404(db, role_id, current_user.org_id)
    name = role.name
    await custom_role_service.delete_custom_role(db, role)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="role.deleted",
        entity_type="custom_role", entity_id=role_id, entity_label=name,
        detail=f"Deleted role \"{name}\"",
    )

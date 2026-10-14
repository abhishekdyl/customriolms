import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.core.security import hash_password
from app.core.session import revoke_all_sessions
from app.models.org import Org
from app.models.team import Team
from app.models.user import RoleName, User, UserStatus
from app.schemas.user import (
    AcceptInviteRequest,
    BulkInviteResult,
    InviteUserRequest,
    LearnerProgressOut,
    UpdateRoleRequest,
    UpdateTeamRequest,
    UpdateUserStatusRequest,
    UserOut,
)
from app.services import dashboard_service
from app.services.invite_service import bulk_invite_from_csv, invite_user

router = APIRouter(prefix="/api/v1/users", tags=["users"])


async def _get_org_or_404(db: AsyncSession, org_id: uuid.UUID) -> Org:
    result = await db.execute(select(Org).where(Org.id == org_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    return org


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def list_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # DEACTIVATED (i.e. "removed") users never show up again — that's the
    # whole point of Remove vs. Suspend. SUSPENDED users still show, with
    # a badge, since suspension is meant to be visible and reversible.
    result = await db.execute(
        select(User, Team.name)
        .outerjoin(Team, Team.id == User.team_id)
        .where(User.org_id == current_user.org_id, User.status != UserStatus.DEACTIVATED)
    )
    return [
        UserOut.model_validate({**user.__dict__, "team_name": team_name})
        for user, team_name in result.all()
    ]


@router.get("/progress", response_model=list[LearnerProgressOut], dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def get_learner_progress(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every active/invited learner's own average progress, org-wide — the
    real numbers behind the Org Admin / Team Lead dashboards' completion
    stats and per-member rows. A Team Lead gets the whole org's list too
    (same as GET /users) and filters to their own team client-side."""
    progress = await dashboard_service.learner_progress_map(db, current_user.org_id)
    return [LearnerProgressOut(user_id=uid, **data) for uid, data in progress.items()]


@router.post("/invite", response_model=UserOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def invite_single_user(body: InviteUserRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # A Team Lead can only invite into their own team — enforced here,
    # not just assumed from the frontend not offering other teams.
    if current_user.role == RoleName.TEAM_LEAD and body.team_id != current_user.team_id:
        raise HTTPException(status_code=403, detail="Team Leads can only invite into their own team")

    org = await _get_org_or_404(db, current_user.org_id)
    try:
        user = await invite_user(
            db, org_id=org.id, email=body.email.lower(),
            name=(body.name or "").strip() or body.email.split("@")[0], role=body.role, team_id=body.team_id,
        )
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return user


@router.post("/bulk-invite", response_model=BulkInviteResult, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def bulk_invite(file: UploadFile, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a .csv file")
    org = await _get_org_or_404(db, current_user.org_id)
    contents = await file.read()
    try:
        return await bulk_invite_from_csv(db, org_id=org.id, file_bytes=contents)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/accept-invite", response_model=UserOut)
async def accept_invite(body: AcceptInviteRequest, db: AsyncSession = Depends(get_db)):
    """No auth required — the invite token itself is the credential, exactly once."""
    result = await db.execute(select(User).where(User.invite_token == body.token, User.status == UserStatus.INVITED))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=400, detail="Invalid or already-used invite link")

    user.hashed_password = hash_password(body.password)
    user.status = UserStatus.ACTIVE
    user.invite_token = None  # single use — burn it immediately
    await db.commit()
    return user


@router.patch("/{user_id}/role", response_model=UserOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def change_role(user_id: uuid.UUID, body: UpdateRoleRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't change your own role")
    user = await _get_user_or_404(db, user_id, current_user.org_id)
    user.role = body.role
    await db.commit()
    # TODO(audit log module): AuditLog.record(actor=current_user, action="role_change", target=user)
    return user


@router.patch("/{user_id}/team", response_model=UserOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def change_team(user_id: uuid.UUID, body: UpdateTeamRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Moves a user to a different team (or to no team). Separate from
    /role — the Users & Access page's bulk 'Move to team' action and the
    single-invite team picker both need this without also touching role."""
    user = await _get_user_or_404(db, user_id, current_user.org_id)
    if body.team_id is not None:
        team_check = await db.execute(select(Team).where(Team.id == body.team_id, Team.org_id == current_user.org_id))
        if team_check.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Team not found")
    user.team_id = body.team_id
    await db.commit()
    team_name = None
    if user.team_id is not None:
        team_row = await db.execute(select(Team.name).where(Team.id == user.team_id))
        team_name = team_row.scalar_one_or_none()
    return UserOut.model_validate({**user.__dict__, "team_name": team_name})


@router.patch("/{user_id}/status", response_model=UserOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def update_user_status(user_id: uuid.UUID, body: UpdateUserStatusRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Suspend or reactivate. Not the same endpoint as DELETE below —
    suspension is reversible and the user stays visible in the list with
    a badge; DELETE is a one-way soft delete that hides them entirely."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't suspend your own account")
    if body.status not in (UserStatus.ACTIVE, UserStatus.SUSPENDED):
        raise HTTPException(status_code=400, detail="status must be 'active' or 'suspended'")

    user = await _get_user_or_404(db, user_id, current_user.org_id)
    user.status = body.status
    await db.commit()

    # Same reasoning as suspending an org (see orgs.py): flipping the flag
    # only blocks future logins. Kill any session this user is mid-way
    # through right now so "suspend" takes effect immediately.
    if body.status == UserStatus.SUSPENDED:
        await revoke_all_sessions(str(user.id))

    return user


@router.delete("/{user_id}", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def remove_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't remove your own account")
    user = await _get_user_or_404(db, user_id, current_user.org_id)
    # Soft delete — a learner's enrollment/certificate history must survive
    # them leaving the org. Hard-deleting a User row would cascade-orphan
    # every ENROLLMENT/CERTIFICATE row pointing at it.
    user.status = UserStatus.DEACTIVATED
    await db.commit()
    await revoke_all_sessions(str(user.id))


async def _get_user_or_404(db: AsyncSession, user_id: uuid.UUID, org_id: uuid.UUID) -> User:
    result = await db.execute(select(User).where(User.id == user_id, User.org_id == org_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user

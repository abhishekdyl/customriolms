import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_capability
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.core.session import create_session, revoke_all_sessions
from app.models.org import Org
from app.models.team import Team
from app.models.user import RoleName, User, UserStatus, split_full_name
from app.schemas.auth import TokenResponse
from app.schemas.user import (
    AcceptInviteRequest,
    AdminUpdateUserRequest,
    BulkInviteResult,
    InviteUserRequest,
    LearnerProgressOut,
    UpdateRoleRequest,
    UpdateTeamRequest,
    UpdateUserStatusRequest,
    UserOut,
)
from app.schemas.profile_field import ProfileFieldValueOut, ProfileFieldValuesUpdate
from app.services import audit_log_service, custom_role_service, dashboard_service
from app.services import permission_service
from app.services import profile_field_service
from app.services.invite_service import bulk_invite_from_csv, invite_user
from app.services.permission_service import is_team_scoped

# An Org Admin can impersonate a lower-privileged account to see exactly
# what that person sees ("login as") — never another Org Admin and never
# platform staff. Keeps the feature a support tool, not a way for one
# admin account to quietly take over another admin's or a platform
# account's session.
_IMPERSONATABLE_ROLES = (RoleName.TEAM_LEAD, RoleName.LEARNER, RoleName.CUSTOM)

router = APIRouter(prefix="/api/v1/users", tags=["users"])


async def _get_org_or_404(db: AsyncSession, org_id: uuid.UUID) -> Org:
    result = await db.execute(select(Org).where(Org.id == org_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    return org


async def _check_custom_role_belongs_to_org(db: AsyncSession, custom_role_id: uuid.UUID | None, org_id: uuid.UUID) -> None:
    """Every endpoint that accepts role=custom + custom_role_id validates
    the id this way — the schema layer (see _require_custom_role_id)
    only checks the two fields are paired, not that the id is real or
    belongs to this org. 404s the same way _get_user_or_404 does for a
    cross-org/nonexistent target, rather than letting one org assign a
    role it doesn't own."""
    if custom_role_id is not None:
        await custom_role_service.get_custom_role_or_404(db, custom_role_id, org_id)


def _user_out(user: User, team_name: str | None = None) -> UserOut:
    """UserOut.model_validate plus the two fields it can't get from
    from_attributes alone: team_name (needs a join the caller already
    did) and custom_role_name (read straight off user.custom_role — the
    relationship is lazy="selectin", so it's already loaded on every User
    object without an extra query here)."""
    row = UserOut.model_validate(user)
    row.team_name = team_name
    if user.custom_role is not None:
        row.custom_role_name = user.custom_role.name
    caps = permission_service.user_capabilities(user)
    row.capabilities = sorted(caps) if caps is not None else None
    return row


@router.get("", response_model=list[UserOut], dependencies=[Depends(require_capability("users.view"))])
async def list_users(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # DEACTIVATED (i.e. "removed") users never show up again — that's the
    # whole point of Remove vs. Suspend. SUSPENDED users still show, with
    # a badge, since suspension is meant to be visible and reversible.
    result = await db.execute(
        select(User, Team.name)
        .outerjoin(Team, Team.id == User.team_id)
        .where(User.org_id == current_user.org_id, User.status != UserStatus.DEACTIVATED)
    )
    return [_user_out(user, team_name) for user, team_name in result.all()]


@router.get("/progress", response_model=list[LearnerProgressOut], dependencies=[Depends(require_capability("users.view"))])
async def get_learner_progress(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every active/invited learner's own average progress, org-wide — the
    real numbers behind the Org Admin / Team Lead dashboards' completion
    stats and per-member rows. A Team Lead gets the whole org's list too
    (same as GET /users) and filters to their own team client-side."""
    progress = await dashboard_service.learner_progress_map(db, current_user.org_id)
    return [LearnerProgressOut(user_id=uid, **data) for uid, data in progress.items()]


@router.post("/invite", response_model=UserOut, dependencies=[Depends(require_capability("users.invite"))])
async def invite_single_user(body: InviteUserRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # A Team Lead — or a custom role scoped to "own team" — can only
    # invite into their own team, enforced here, not just assumed from
    # the frontend not offering other teams.
    if is_team_scoped(current_user) and body.team_id != current_user.team_id:
        raise HTTPException(status_code=403, detail="You can only invite into your own team")

    await _check_custom_role_belongs_to_org(db, body.custom_role_id, current_user.org_id)
    org = await _get_org_or_404(db, current_user.org_id)

    # Same enforcement bulk CSV invite already had (see
    # bulk_invite_from_csv's docstring): a field an Org Admin marked
    # required must have a non-empty value before the user is created at
    # all, not left to be filled in later with nothing stopping it from
    # never happening.
    fields = await profile_field_service.list_fields(db, current_user.org_id)
    missing = [
        f.name for f in fields
        if f.required and not (body.custom_fields.get(f.shortname) or "").strip()
    ]
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s): {', '.join(missing)}")

    try:
        user = await invite_user(
            db, org=org, email=body.email.lower(),
            name=(body.name or "").strip() or body.email.split("@")[0], role=body.role, team_id=body.team_id,
            custom_role_id=body.custom_role_id,
        )
        if body.custom_fields:
            await profile_field_service.set_values_for_user(db, current_user.org_id, user.id, body.custom_fields, commit=False)
        await db.commit()
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    # Not the `user` invite_user returned — it only flushed, so
    # user.custom_role (lazy="selectin") was never actually loaded and
    # _user_out reading it would issue a lazy load outside any awaited
    # query. A plain re-fetch loads it properly in one awaited SELECT.
    user = await _get_user_or_404(db, user.id, current_user.org_id)
    return _user_out(user)


@router.post("/bulk-invite", response_model=BulkInviteResult, dependencies=[Depends(require_capability("users.bulk_invite"))])
async def bulk_invite(file: UploadFile, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="Upload a .csv file")
    org = await _get_org_or_404(db, current_user.org_id)
    contents = await file.read()
    try:
        return await bulk_invite_from_csv(db, org=org, file_bytes=contents)
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


@router.patch("/{user_id}/role", response_model=UserOut, dependencies=[Depends(require_capability("users.manage_role"))])
async def change_role(user_id: uuid.UUID, body: UpdateRoleRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You can't change your own role")
    await _check_custom_role_belongs_to_org(db, body.custom_role_id, current_user.org_id)
    user = await _get_user_or_404(db, user_id, current_user.org_id)
    old_role = user.role
    user.role = body.role
    user.custom_role_id = body.custom_role_id  # None whenever body.role != CUSTOM — schema already enforced that pairing
    await db.commit()
    # Not db.refresh(user) — that doesn't reliably re-run the selectin
    # loader for custom_role in an async session, and _user_out needs it
    # freshly loaded (changed above). A plain re-fetch does.
    user = await _get_user_or_404(db, user_id, current_user.org_id)
    if old_role != user.role:
        await audit_log_service.record(
            db, org_id=current_user.org_id, actor=current_user, action="user.role_changed",
            entity_type="user", entity_id=user.id, entity_label=user.full_name,
            detail=f"Changed role: {old_role.value} → {user.role.value}",
        )
    return _user_out(user)


@router.patch("/{user_id}/team", response_model=UserOut, dependencies=[Depends(require_capability("users.manage_team"))])
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
    return _user_out(user, team_name)


@router.patch("/{user_id}/status", response_model=UserOut, dependencies=[Depends(require_capability("users.manage_status"))])
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

    return _user_out(user)


@router.get(
    "/{user_id}", response_model=UserOut,
    dependencies=[Depends(require_capability("users.view"))],
)
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """One user's full profile — the Org Admin / Team Lead "view profile"
    panel. Scoped the same as the rest of this router: anyone outside the
    caller's own org is a 404, same as if they didn't exist."""
    user = await _get_user_or_404(db, user_id, current_user.org_id)
    team_name = None
    if user.team_id is not None:
        team_name = (await db.execute(select(Team.name).where(Team.id == user.team_id))).scalar_one_or_none()
    return _user_out(user, team_name)


@router.patch("/{user_id}/profile", response_model=UserOut, dependencies=[Depends(require_capability("users.manage_profile"))])
async def update_user_profile(
    user_id: uuid.UUID, body: AdminUpdateUserRequest,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """The Org Admin "edit profile" form — full name/email/role are
    mandatory (AdminUpdateUserRequest enforces that), same as creating a
    user in the first place; team and the rest are optional extras. Use
    your own /auth/me to edit your own profile instead — blocked here for
    the same reason /role and /status block self-targeting, so an admin
    can't accidentally strip or change their own role through this form."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Edit your own profile from your account settings instead")

    await _check_custom_role_belongs_to_org(db, body.custom_role_id, current_user.org_id)
    user = await _get_user_or_404(db, user_id, current_user.org_id)

    email = body.email.lower()
    if email != user.email:
        existing = await db.execute(select(User.id).where(User.email == email, User.id != user.id))
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"{email} is already registered to another account")
        # Keep the login-identifier column in sync only when it was still
        # the default (a copy of the old email) — a custom username the
        # user picked for themselves is left untouched.
        if user.username == user.email:
            user.username = email
        user.email = email

    if body.team_id is not None:
        team_check = await db.execute(select(Team.id).where(Team.id == body.team_id, Team.org_id == current_user.org_id))
        if team_check.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Team not found")

    old_role = user.role
    user.firstname, user.lastname = split_full_name(body.name)
    user.role = body.role
    user.custom_role_id = body.custom_role_id  # None whenever body.role != CUSTOM — schema already enforced that pairing
    user.team_id = body.team_id
    user.phone = body.phone
    user.job_title = body.job_title
    user.location = body.location
    user.bio = body.bio
    user.country = body.country

    await db.commit()
    # Not db.refresh(user) — see change_role's identical note on why a
    # plain re-fetch is used instead when custom_role_id may have changed.
    user = await _get_user_or_404(db, user_id, current_user.org_id)
    if old_role != user.role:
        await audit_log_service.record(
            db, org_id=current_user.org_id, actor=current_user, action="user.role_changed",
            entity_type="user", entity_id=user.id, entity_label=user.full_name,
            detail=f"Changed role: {old_role.value} → {user.role.value} (via profile edit)",
        )
    team_name = None
    if user.team_id is not None:
        team_name = (await db.execute(select(Team.name).where(Team.id == user.team_id))).scalar_one_or_none()
    return _user_out(user, team_name)


@router.post("/{user_id}/login-as", response_model=TokenResponse, dependencies=[Depends(require_capability("users.login_as"))])
async def login_as_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """"Login as" — issues the target user a real access/refresh token
    pair exactly like a normal login, so the Org Admin sees the product
    precisely as that person does. Restricted to Team Lead/Learner targets
    (see _IMPERSONATABLE_ROLES) so this can't be used to take over another
    admin's or platform staff's account, and to active accounts only — a
    suspended/deactivated/not-yet-activated user can't be "seen as" to
    route around their own lock. The admin's own session is untouched;
    the frontend keeps the admin's token aside and restores it for
    "Return to admin" rather than this endpoint doing anything special to
    end the impersonation itself."""
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="You're already logged in as yourself")

    user = await _get_user_or_404(db, user_id, current_user.org_id)
    if user.role not in _IMPERSONATABLE_ROLES:
        raise HTTPException(status_code=403, detail="Can't log in as another admin or platform account")
    if user.status != UserStatus.ACTIVE:
        raise HTTPException(status_code=400, detail=f"{user.full_name}'s account isn't active ({user.status.value})")

    # TODO(audit log module): AuditLog.record(actor=current_user, action="login_as", target=user)
    access_token, jti, ttl_seconds = create_access_token(str(user.id), str(user.org_id), user.role.value)
    await create_session(str(user.id), jti, ttl_seconds)

    return TokenResponse(
        access_token=access_token,
        refresh_token=create_refresh_token(str(user.id)),
        must_change_password=user.must_change_password,
        role=user.role.value,
    )


@router.delete("/{user_id}", status_code=204, dependencies=[Depends(require_capability("users.delete"))])
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


@router.get(
    "/{user_id}/custom-fields", response_model=list[ProfileFieldValueOut],
    dependencies=[Depends(require_capability("users.view"))],
)
async def get_user_custom_fields(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """An admin viewing one user's custom-field answers — same shape as
    the user's own GET /auth/me/custom-fields, scoped to this org."""
    user = await _get_user_or_404(db, user_id, current_user.org_id)
    return await profile_field_service.get_values_for_user(db, current_user.org_id, user.id)


@router.patch(
    "/{user_id}/custom-fields", response_model=list[ProfileFieldValueOut],
    dependencies=[Depends(require_capability("users.manage_profile"))],
)
async def update_user_custom_fields(
    user_id: uuid.UUID, body: ProfileFieldValuesUpdate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Org Admin setting/correcting a user's custom-field answers on
    their behalf — e.g. filling in "Employee ID" for someone bulk-invited
    via CSV, who hasn't logged in yet to fill it in themselves."""
    user = await _get_user_or_404(db, user_id, current_user.org_id)
    await profile_field_service.set_values_for_user(db, current_user.org_id, user.id, body.values)
    return await profile_field_service.get_values_for_user(db, current_user.org_id, user.id)

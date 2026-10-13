from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_and_jti
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.core.session import create_session, revoke_all_sessions, revoke_all_sessions_except, revoke_session
from app.models.org import Org, OrgStatus
from app.models.platform_settings import SINGLETON_ID, PlatformSettings
from app.models.team import Team
from app.models.user import RoleName, User, UserStatus
from app.schemas.auth import ChangePasswordRequest, LoginRequest, RegisterRequest, TokenResponse, UpdateProfileRequest, UserOut

router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """
    Registers a brand-new org with its first user as Org Admin.
    Inviting subsequent users happens via a separate /users/invite
    endpoint (Team Lead/Learner default) — this one is org creation only.
    """
    settings_row = (await db.execute(select(PlatformSettings).where(PlatformSettings.id == SINGLETON_ID))).scalar_one_or_none()
    if settings_row is not None and not settings_row.allow_self_serve_signup:
        raise HTTPException(
            status_code=403,
            detail="Self-serve sign-up is currently disabled. Contact your Riosmart representative for access.",
        )

    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    slug = body.org_name.lower().replace(" ", "-")
    org = Org(name=body.org_name, slug=slug)
    db.add(org)
    await db.flush()  # get org.id before creating the user

    user = User(
        org_id=org.id,
        name=body.name,
        email=body.email,
        hashed_password=hash_password(body.password),
        role=RoleName.ORG_ADMIN,
    )
    db.add(user)
    await db.commit()

    access_token, jti, ttl_seconds = create_access_token(str(user.id), str(org.id), user.role.value)
    await create_session(str(user.id), jti, ttl_seconds)

    return TokenResponse(
        access_token=access_token,
        refresh_token=create_refresh_token(str(user.id)),
        role=user.role.value,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Incorrect email or password")

    # Per-user status. A removed (DEACTIVATED) account is treated exactly
    # like an unknown email so it can't be probed; a SUSPENDED one gets a
    # clear reason, since that state is visible and reversible by design.
    if user.status == UserStatus.DEACTIVATED:
        raise HTTPException(status_code=401, detail="Incorrect email or password")
    if user.status == UserStatus.SUSPENDED:
        raise HTTPException(status_code=403, detail="Your account has been suspended. Contact your administrator.")

    # Stop a suspended org's users at the door with a clear reason, rather
    # than letting them log in and only find out something's wrong when a
    # later API call 403s. get_current_user enforces this same rule on
    # every subsequent request too, so this is a friendlier first check,
    # not the only one.
    if user.role != RoleName.SUPER_ADMIN:
        org_result = await db.execute(select(Org.status).where(Org.id == user.org_id))
        if org_result.scalar_one_or_none() == OrgStatus.SUSPENDED:
            raise HTTPException(
                status_code=403,
                detail="Your organization has been suspended. Contact your Riosmart representative.",
            )

    access_token, jti, ttl_seconds = create_access_token(str(user.id), str(user.org_id), user.role.value)
    # Registers this login as a new active session. If the user is now
    # over settings.MAX_CONCURRENT_SESSIONS, their oldest other session
    # (e.g. an old browser tab) is silently evicted here — that device
    # will get a 401 next time it calls the API.
    await create_session(str(user.id), jti, ttl_seconds)

    return TokenResponse(
        access_token=access_token,
        refresh_token=create_refresh_token(str(user.id)),
        must_change_password=user.must_change_password,
        role=user.role.value,
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
async def change_password(
    body: ChangePasswordRequest,
    current: tuple[User, str] = Depends(get_current_user_and_jti),
    db: AsyncSession = Depends(get_db),
):
    current_user, jti = current
    if not verify_password(body.current_password, current_user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    current_user.hashed_password = hash_password(body.new_password)
    current_user.must_change_password = False
    await db.commit()

    # A password change should kick every OTHER device logged in as this
    # user — otherwise someone who had the shared default password stays
    # logged in on some other browser even after it's changed. The device
    # doing the changing stays logged in, so there's no need to log back
    # in immediately after.
    await revoke_all_sessions_except(str(current_user.id), keep_jti=jti)
async def logout(current: tuple[User, str] = Depends(get_current_user_and_jti)):
    """Ends only the current device/browser's session."""
    user, jti = current
    await revoke_session(str(user.id), jti)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(current_user: User = Depends(get_current_user)):
    """Ends every active session for this user, on every device."""
    await revoke_all_sessions(str(current_user.id))


async def _user_out(db: AsyncSession, user: User) -> UserOut:
    """UserOut plus the team's name (looked up explicitly — touching user.team
    here would lazy-load inside an async session and fail)."""
    team_name = None
    if user.team_id is not None:
        team_name = (await db.execute(select(Team.name).where(Team.id == user.team_id))).scalar_one_or_none()
    out = UserOut.model_validate(user)
    out.team_name = team_name
    return out


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _user_out(db, current_user)


@router.patch("/me", response_model=UserOut)
async def update_me(body: UpdateProfileRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Edit your own profile. Only `name` is editable — see UpdateProfileRequest."""
    current_user.name = body.name
    await db.commit()
    await db.refresh(current_user)
    return await _user_out(db, current_user)

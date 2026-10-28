import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from google.auth import exceptions as google_auth_exceptions
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token as google_id_token
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_and_jti
from app.core.config import settings
from app.core.database import get_db
from app.core.security import create_access_token, create_refresh_token, hash_password, verify_password
from app.core.session import create_session, revoke_all_sessions, revoke_all_sessions_except, revoke_session
from app.models.org import Org, OrgStatus
from app.models.platform_settings import SINGLETON_ID, PlatformSettings
from app.models.team import Team
from app.models.user import RoleName, User, UserStatus, split_full_name
from app.services import notification_service as notification_svc
from app.services import storage_service
from app.services import profile_field_service
from app.schemas.auth import (
    ChangePasswordRequest, ForgotPasswordRequest, GoogleLoginRequest, GoogleRegisterRequest, LoginRequest, RegisterRequest,
    ResetPasswordRequest, TokenResponse, UpdateProfileRequest, UserOut,
)
from app.schemas.profile_field import ProfileFieldValueOut, ProfileFieldValuesUpdate

logger = logging.getLogger(__name__)

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

    firstname, lastname = split_full_name(body.name)
    user = User(
        org_id=org.id,
        firstname=firstname,
        lastname=lastname,
        email=body.email,
        username=body.email,  # default — see Org.allow_custom_username
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


async def _verify_google_credential(credential: str) -> dict:
    """Verifies a Google Identity Services ID token server-side against
    Google's own public keys (google-auth fetches and caches them) — the
    frontend hands us the raw signed JWT, never a parsed/trusted payload,
    so forging one would require Google's private signing key. Raises
    HTTPException on anything that doesn't check out: bad signature,
    expired, or (critically) issued for a different OAuth client — that
    last check is what stops a token minted for some other site's Google
    sign-in button from being replayed against this one."""
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Google sign-in isn't configured on this server.")
    try:
        payload = google_id_token.verify_oauth2_token(
            credential, google_requests.Request(), settings.GOOGLE_CLIENT_ID,
        )
    except ValueError:
        # A malformed/expired/wrong-audience token — verify_oauth2_token's
        # own documented failure mode.
        raise HTTPException(status_code=401, detail="That Google sign-in couldn't be verified. Try again.")
    except google_auth_exceptions.GoogleAuthError:
        # Couldn't even reach Google to fetch its signing certs (network
        # blip, DNS, an outbound-traffic allowlist) — a real but
        # different failure from "the token itself is bad", so it gets
        # its own message instead of masquerading as an auth rejection.
        raise HTTPException(status_code=503, detail="Couldn't reach Google to verify sign-in. Try again in a moment.")
    if not payload.get("email_verified", False):
        raise HTTPException(status_code=401, detail="That Google account's email isn't verified.")
    return payload


@router.post("/google/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def google_register(body: GoogleRegisterRequest, db: AsyncSession = Depends(get_db)):
    """Google's equivalent of /auth/register — creates a brand-new org
    with its first user as Org Admin, using the identity Google already
    verified instead of a typed name/email/password. org_name still has
    to come from the person (Google has no concept of it)."""
    settings_row = (await db.execute(select(PlatformSettings).where(PlatformSettings.id == SINGLETON_ID))).scalar_one_or_none()
    if settings_row is not None and not settings_row.allow_self_serve_signup:
        raise HTTPException(
            status_code=403,
            detail="Self-serve sign-up is currently disabled. Contact your Riosmart representative for access.",
        )

    payload = await _verify_google_credential(body.credential)
    email = payload["email"]
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered — log in instead.")

    slug = body.org_name.lower().replace(" ", "-")
    org = Org(name=body.org_name, slug=slug)
    db.add(org)
    await db.flush()

    firstname, lastname = split_full_name(payload.get("name") or email.split("@")[0])
    user = User(
        org_id=org.id, firstname=firstname, lastname=lastname, email=email, username=email,
        hashed_password=None, google_sub=payload["sub"], role=RoleName.ORG_ADMIN,
    )
    db.add(user)
    await db.commit()

    access_token, jti, ttl_seconds = create_access_token(str(user.id), str(org.id), user.role.value)
    await create_session(str(user.id), jti, ttl_seconds)
    return TokenResponse(access_token=access_token, refresh_token=create_refresh_token(str(user.id)), role=user.role.value)


@router.post("/google", response_model=TokenResponse)
async def google_login(body: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    """Google's equivalent of /auth/login. Matches an EXISTING user by
    email and links the Google account to it (first successful Google
    sign-in sets google_sub, same as any other "verify once, remember
    after" link) — this never creates an org on its own; use
    /auth/google/register for that. A user who already has a password
    keeps it; this just gives them a second way in, it doesn't replace
    change-password/forgot-password."""
    payload = await _verify_google_credential(body.credential)
    email = payload["email"]
    result = await db.execute(select(User).where(or_(User.email == email, User.google_sub == payload["sub"])))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(
            status_code=404,
            detail="No account found for that Google email. Create an organization first, or ask your admin to invite you.",
        )

    if user.status == UserStatus.DEACTIVATED:
        raise HTTPException(status_code=401, detail="This account is no longer active.")
    if user.status == UserStatus.SUSPENDED:
        raise HTTPException(status_code=403, detail="Your account has been suspended. Contact your administrator.")
    if user.role != RoleName.SUPER_ADMIN:
        org_result = await db.execute(select(Org.status).where(Org.id == user.org_id))
        if org_result.scalar_one_or_none() == OrgStatus.SUSPENDED:
            raise HTTPException(
                status_code=403,
                detail="Your organization has been suspended. Contact your Riosmart representative.",
            )

    if user.google_sub is None:
        user.google_sub = payload["sub"]
        await db.commit()

    access_token, jti, ttl_seconds = create_access_token(str(user.id), str(user.org_id), user.role.value)
    await create_session(str(user.id), jti, ttl_seconds)
    return TokenResponse(
        access_token=access_token, refresh_token=create_refresh_token(str(user.id)),
        must_change_password=user.must_change_password, role=user.role.value,
    )


@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    # body.email is the login *identifier* — matches either column, so a
    # user who has customized their username (once their org allows it)
    # can log in with it, while everyone else keeps logging in by email
    # (which is also always what username defaults to at creation).
    result = await db.execute(select(User).where(or_(User.email == body.email, User.username == body.email)))
    user = result.scalar_one_or_none()
    # hashed_password is null for an invited user who hasn't set one yet,
    # and for a Google-only account (see /auth/google) — verify_password
    # would crash passlib on None rather than just failing the check, so
    # this has to be caught before it ever reaches that call.
    if not user or not user.hashed_password or not verify_password(body.password, user.hashed_password):
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


@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
async def forgot_password(body: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Always responds the same way whether or not the email is
    registered — an attacker probing for valid emails gets no signal
    either way. When it IS registered, a one-time reset link is emailed
    through the user's org's own SMTP settings (Settings ▸ Notifications
    ▸ SMTP — same sender every other transactional email in this app
    uses); an org that hasn't configured SMTP has nowhere to send it, so
    this logs the link server-side instead so the flow is still usable/
    testable without real SMTP wired up."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()
    if user is not None and user.status == UserStatus.ACTIVE:
        raw_token = secrets.token_urlsafe(32)
        user.reset_token_hash = hashlib.sha256(raw_token.encode()).hexdigest()
        user.reset_token_expires_at = datetime.now(timezone.utc) + timedelta(
            minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES
        )
        await db.commit()

        reset_link = f"{settings.FRONTEND_URL}/reset-password?token={raw_token}"
        sent = await notification_svc.send_email_if_configured(
            db, user.org_id, user.email, "Reset your Riosmart LMS password",
            f"Hi {user.firstname},\n\n"
            "Someone requested a password reset for your Riosmart LMS account. "
            f"If that was you, set a new password here (this link expires in "
            f"{settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES} minutes):\n\n{reset_link}\n\n"
            "If you didn't request this, you can safely ignore this email — your password won't change.",
        )
        if not sent:
            logger.warning(
                "Password reset requested for %s but org %s has no SMTP configured — reset link: %s",
                user.email, user.org_id, reset_link,
            )

    return {"detail": "If an account exists for that email, a reset link has been sent."}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
async def reset_password(body: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    token_hash = hashlib.sha256(body.token.encode()).hexdigest()
    result = await db.execute(select(User).where(User.reset_token_hash == token_hash))
    user = result.scalar_one_or_none()
    if (
        user is None
        or user.reset_token_expires_at is None
        or user.reset_token_expires_at < datetime.now(timezone.utc)
    ):
        raise HTTPException(status_code=400, detail="This reset link is invalid or has expired. Request a new one.")

    user.hashed_password = hash_password(body.new_password)
    user.must_change_password = False
    user.reset_token_hash = None
    user.reset_token_expires_at = None
    await db.commit()

    # A password reset means "I may have lost control of the old
    # password" — stronger than an ordinary change-password, where the
    # device making the change is trusted to stay logged in. Here there's
    # no such trusted device, so every session (including wherever the
    # forgot-password request itself was made from) gets revoked; the
    # person logs back in fresh with the new password.
    await revoke_all_sessions(str(user.id))


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


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
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
    here would lazy-load inside an async session and fail) and a fresh
    presigned/local URL for the avatar, if one is set."""
    team_name = None
    if user.team_id is not None:
        team_name = (await db.execute(select(Team.name).where(Team.id == user.team_id))).scalar_one_or_none()
    out = UserOut.model_validate(user)
    out.team_name = team_name
    if user.avatar_key:
        out.profile_image_url = storage_service.presigned_get_url(user.avatar_key)
    return out


@router.get("/me", response_model=UserOut)
async def me(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await _user_out(db, current_user)


@router.patch("/me", response_model=UserOut)
async def update_me(body: UpdateProfileRequest, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Edit your own profile — see UpdateProfileRequest for which fields."""
    current_user.firstname = body.firstname
    current_user.lastname = body.lastname
    current_user.city = body.city
    current_user.country = body.country
    current_user.timezone = body.timezone
    current_user.companyname = body.companyname

    if body.username is not None and body.username != current_user.username:
        org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()
        if not org.allow_custom_username:
            raise HTTPException(status_code=403, detail="Your organization doesn't allow custom usernames")
        taken = (await db.execute(
            select(User.id).where(User.username == body.username, User.id != current_user.id)
        )).scalar_one_or_none()
        if taken:
            raise HTTPException(status_code=400, detail="That username is already taken")
        current_user.username = body.username

    await db.commit()
    await db.refresh(current_user)
    return await _user_out(db, current_user)


@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...), current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    storage_service.validate_image_upload(file, size)
    record = await storage_service.store_file(
        db, file, org_id=current_user.org_id, component="user", filearea="avatar",
        itemid=current_user.id, user=current_user,
    )
    current_user.avatar_key = storage_service.file_key(record)
    await db.commit()
    await db.refresh(current_user)
    return await _user_out(db, current_user)


@router.get("/me/custom-fields", response_model=list[ProfileFieldValueOut])
async def get_my_custom_fields(current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Every custom field the Org Admin has defined for this org, with
    this user's own current value for each (see profile_field_service)."""
    return await profile_field_service.get_values_for_user(db, current_user.org_id, current_user.id)


@router.patch("/me/custom-fields", response_model=list[ProfileFieldValueOut])
async def update_my_custom_fields(
    body: ProfileFieldValuesUpdate, current_user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db),
):
    await profile_field_service.set_values_for_user(db, current_user.org_id, current_user.id, body.values)
    return await profile_field_service.get_values_for_user(db, current_user.org_id, current_user.id)

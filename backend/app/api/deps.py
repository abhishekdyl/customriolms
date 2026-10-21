from fastapi import Depends, Header, HTTPException, Query, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import decode_token
from app.core.session import is_session_active
from app.models.org import Org, OrgStatus
from app.models.user import RoleName, User, UserStatus

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    return await _validate_token(token, db)


async def get_current_user_via_header_or_query(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Same validation as get_current_user, but also accepts the token as a
    ?token= query param. Only for routes an <iframe>/<video> loads as a
    plain browser navigation — there's no way to attach an Authorization
    header to that, so the token has to travel in the URL instead. Never
    use this for anything else; a URL (and its query string) ends up in
    logs and browser history, which an auth header doesn't."""
    bearer = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None
    resolved = bearer or token
    if not resolved:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return await _validate_token(resolved, db)


async def get_optional_user_via_header_or_query(
    authorization: str | None = Header(default=None),
    token: str | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> User | None:
    """Same as get_current_user_via_header_or_query, but returns None
    instead of 401ing when NO token was supplied at all — for a route a
    SCORM package's OWN relative asset requests hit (its
    <script src=...>, <link href=...>, <img src=...>, an XHR/fetch its
    JS makes for another file in the package), not just the one
    top-level <iframe src=...> navigation.

    Only the top-level navigation can carry the ?token= query param in
    the first place: the browser resolves every *relative* URL the
    served HTML/CSS/JS references against the current page's URL, and
    per the URL spec a relative path reference does NOT inherit the
    base URL's query string — so "assets/script.js" from a page loaded
    at ".../index.html?token=XYZ" is requested as
    ".../assets/script.js" with no token at all, however the package
    links it. Treating a MISSING token as "no user" rather than a 401 is
    what lets those sub-resource requests through (the caller still
    checks module.type == SCORM and resolves the file strictly by
    org_id/module_id/path — all UUIDs — which is the same trust level a
    presigned R2 URL already gets for a WATCH/READ module's file_url,
    see storage_service).

    A token that WAS supplied but is invalid/expired still 401s, same as
    get_current_user_via_header_or_query — only the top-level navigation
    ever supplies one at all, so a present-but-bad token can only mean
    someone's actual session expired (or was tampered with) on the one
    request that's supposed to carry the full per-learner assignment/
    lock check; silently downgrading THAT request to anonymous would let
    a stale or guessed link skip that check entirely, see
    get_scorm_content."""
    bearer = authorization[7:] if authorization and authorization.lower().startswith("bearer ") else None
    resolved = bearer or token
    if not resolved:
        return None
    return await _validate_token(resolved, db)


async def _validate_token(token: str, db: AsyncSession) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        jti = payload.get("jti")
        if user_id is None or jti is None or payload.get("type") != "access":
            raise credentials_error
    except JWTError:
        raise credentials_error

    # This is what makes the concurrent-session limit and logout actually
    # work: the JWT signature alone can't be revoked, but the session
    # record in Redis can be. If it's gone — evicted for going over the
    # session limit, or the user logged out — the token is rejected here
    # even though it hasn't technically expired yet.
    if not await is_session_active(user_id, jti):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired or logged out elsewhere. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise credentials_error

    # Same idea as the org check below: a token issued before this user was
    # suspended/removed is still valid, so status is re-checked every request.
    if user.status in (UserStatus.SUSPENDED, UserStatus.DEACTIVATED):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your account is not active. Contact your administrator.",
        )

    # This is what actually cuts off a suspended org's users mid-session —
    # not just at login. A token issued before suspension is still
    # cryptographically valid and its Redis session is still active, so
    # without this check a suspended org's admin would keep working right
    # up until their access token naturally expired. Checked on every
    # request, same as the session-revocation check above. Platform staff
    # (SUPER_ADMIN) are parked in an internal org that customers never see
    # and is never suspended, but they're excluded here too, defensively.
    if user.role != RoleName.SUPER_ADMIN:
        org_result = await db.execute(select(Org.status).where(Org.id == user.org_id))
        org_status = org_result.scalar_one_or_none()
        if org_status == OrgStatus.SUSPENDED:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Your organization has been suspended. Contact your Riosmart representative.",
            )

    return user


async def get_current_user_and_jti(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> tuple[User, str]:
    """Same validation as get_current_user, but also hands back the
    session id — only /auth/logout needs this, to know which one
    Redis key to delete."""
    user = await get_current_user(token, db)
    payload = decode_token(token)
    return user, payload["jti"]


def require_role(*allowed_roles: RoleName):
    """
    Usage: @router.delete(..., dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])

    This is the real enforcement point. The admin console hides buttons a
    Team Lead shouldn't see — this is what stops them calling the API
    directly and doing it anyway.
    """
    async def checker(user: User = Depends(get_current_user)) -> User:
        if user.role not in allowed_roles and user.role != RoleName.SUPER_ADMIN:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user.role.value}' is not permitted to perform this action",
            )
        return user
    return checker

from fastapi import Depends, HTTPException, status
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

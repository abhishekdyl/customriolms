from datetime import datetime, timedelta, timezone
from uuid import uuid4

from jose import jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(subject: str, expires_delta: timedelta, extra_claims: dict | None = None) -> str:
    to_encode = {"sub": subject, "exp": datetime.now(timezone.utc) + expires_delta}
    if extra_claims:
        to_encode.update(extra_claims)
    return jwt.encode(to_encode, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def create_access_token(user_id: str, org_id: str, role: str) -> tuple[str, str, int]:
    """
    Returns (token, jti, ttl_seconds). The jti is also handed back so the
    caller (the login/register endpoint) can register it as an active
    session in Redis — the token itself doesn't know about sessions,
    it just carries the id.
    """
    jti = str(uuid4())
    ttl_seconds = settings.ACCESS_TOKEN_EXPIRE_MINUTES * 60
    token = create_token(
        subject=user_id,
        expires_delta=timedelta(seconds=ttl_seconds),
        extra_claims={"org_id": org_id, "role": role, "type": "access", "jti": jti},
    )
    return token, jti, ttl_seconds


def create_refresh_token(user_id: str) -> str:
    return create_token(
        subject=user_id,
        expires_delta=timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
        extra_claims={"type": "refresh"},
    )


def decode_token(token: str) -> dict:
    return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])

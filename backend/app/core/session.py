"""
Server-side session tracking, layered on top of the stateless JWT.

The access token alone can't be revoked or limited — once issued, it's
valid until it expires no matter what. To get "max N concurrent logins"
and "log out this device remotely", every issued token gets a random
`jti` (session id) recorded here in Redis; get_current_user checks that
the jti is still present before trusting the token.

Redis keys used, per user:
  session:{user_id}:{jti}   -> "1", TTL = token lifetime (auto-expires)
  sessions:{user_id}        -> sorted set of jti, score = login timestamp
                                (lets us find + evict the OLDEST session
                                when the user goes over the limit)
"""
import time

from app.core.config import settings
from app.core.redis_client import get_redis


def _session_key(user_id: str, jti: str) -> str:
    return f"session:{user_id}:{jti}"


def _sessions_set_key(user_id: str) -> str:
    return f"sessions:{user_id}"


async def create_session(user_id: str, jti: str, ttl_seconds: int) -> None:
    """Record a new login, then evict the oldest session(s) if the user
    is now over MAX_CONCURRENT_SESSIONS."""
    r = get_redis()
    now = time.time()

    await r.set(_session_key(user_id, jti), "1", ex=ttl_seconds)
    await r.zadd(_sessions_set_key(user_id), {jti: now})

    sessions_key = _sessions_set_key(user_id)
    count = await r.zcard(sessions_key)
    over_limit = count - settings.MAX_CONCURRENT_SESSIONS
    if over_limit > 0:
        oldest = await r.zrange(sessions_key, 0, over_limit - 1)
        if oldest:
            await r.zrem(sessions_key, *oldest)
            await r.delete(*[_session_key(user_id, old_jti) for old_jti in oldest])


async def is_session_active(user_id: str, jti: str) -> bool:
    r = get_redis()
    return bool(await r.exists(_session_key(user_id, jti)))


async def revoke_session(user_id: str, jti: str) -> None:
    """Used by /auth/logout — ends just this one device's session."""
    r = get_redis()
    await r.delete(_session_key(user_id, jti))
    await r.zrem(_sessions_set_key(user_id), jti)


async def revoke_all_sessions(user_id: str) -> None:
    """Used by /auth/logout-all — ends every device at once (e.g. after
    a password change, or a 'log out everywhere' button)."""
    r = get_redis()
    sessions_key = _sessions_set_key(user_id)
    jtis = await r.zrange(sessions_key, 0, -1)
    if jtis:
        await r.delete(*[_session_key(user_id, jti) for jti in jtis])
    await r.delete(sessions_key)


async def revoke_all_sessions_except(user_id: str, keep_jti: str) -> None:
    """Same as revoke_all_sessions, but leaves one session alone. Used by
    /auth/change-password: every OTHER device that had the old (or shared
    default) password gets logged out, but the device the user just used
    to set their new password doesn't — they shouldn't have to log back
    in immediately after doing what was just asked of them."""
    r = get_redis()
    sessions_key = _sessions_set_key(user_id)
    jtis = await r.zrange(sessions_key, 0, -1)
    to_remove = [jti for jti in jtis if jti != keep_jti]
    if to_remove:
        await r.delete(*[_session_key(user_id, jti) for jti in to_remove])
        await r.zrem(sessions_key, *to_remove)

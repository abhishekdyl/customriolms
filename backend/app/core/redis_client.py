from redis.asyncio import Redis, from_url

from app.core.config import settings

_redis: Redis | None = None


def get_redis() -> Redis:
    """
    Single shared connection pool for the whole app. Session tracking
    (login limits, revocation) lives here rather than in Postgres because
    it's high-churn, short-lived data that's fine to lose on a Redis
    restart — worst case, everyone just has to log in again.
    """
    global _redis
    if _redis is None:
        _redis = from_url(settings.REDIS_URL, decode_responses=True)
    return _redis

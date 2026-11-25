import asyncio
import logging
import time
import traceback

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.core.security import decode_token
from app.models.platform_settings import SINGLETON_ID, PlatformSettings
from app.services import notification_service, usage_monitoring_service

if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENV, traces_sample_rate=0.1)

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.APP_NAME)

# Dispatches due on_date/weekly/monthly reminder rules (Notifications ▸
# Reminder rules) — a plain in-process asyncio loop rather than a
# separate worker/broker, since this deployment runs as a single
# uvicorn process. Ticks every 60s; each tick is cheap (one indexed
# "next_fire_at <= now" query — see notification_service.tick) even
# with nothing due. If this process ever runs with multiple workers
# behind one DB, each worker would tick independently and could double-
# send — fine for the single-worker deployment this app ships as today,
# worth revisiting if that changes.
_reminder_task: asyncio.Task | None = None


async def _reminder_loop():
    while True:
        try:
            async with AsyncSessionLocal() as db:
                fired = await notification_service.tick(db)
                if fired:
                    logger.info("Reminder dispatcher fired %d rule(s)", fired)
        except Exception:
            logger.exception("Reminder dispatcher tick failed")
        await asyncio.sleep(60)


@app.on_event("startup")
async def _start_reminder_loop():
    global _reminder_task
    _reminder_task = asyncio.create_task(_reminder_loop())


@app.on_event("shutdown")
async def _stop_reminder_loop():
    if _reminder_task is not None:
        _reminder_task.cancel()

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def _org_request_stat_middleware(request: Request, call_next):
    """Feeds the Super Admin's Usage Monitoring "load" column — see
    usage_monitoring_service.record_request. Deliberately cheap and
    best-effort on the request's own time budget: decoding the token
    here is just a JWT signature check (no DB/Redis round trip, unlike
    get_current_user's full session lookup), and the actual counter
    write happens in a background task AFTER the response is already
    being sent, so neither step can slow down or fail the request
    itself. A request with no/invalid token (login, register, health
    check, an expired or bad token) simply isn't counted — this is a
    "how much load is this ORG generating" signal, not a general access
    log."""
    start = time.monotonic()
    response = await call_next(request)
    duration_ms = round((time.monotonic() - start) * 1000)

    org_id = None
    user_id = None
    auth = request.headers.get("authorization", "")
    if auth.startswith("Bearer "):
        try:
            claims = decode_token(auth[7:])
            org_id = claims.get("org_id")
            user_id = claims.get("sub")
        except Exception:
            org_id = None

    if org_id:
        asyncio.create_task(usage_monitoring_service.record_request(org_id, duration_ms, response.status_code >= 500))
    if org_id and user_id:
        asyncio.create_task(usage_monitoring_service.record_activity(org_id, user_id))

    return response


app.include_router(api_router)


@app.get("/health")
async def health():
    """Railway/Plesk/any host pings this to confirm the app is alive."""
    return {"status": "ok", "env": settings.ENV}


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """Without this, Starlette's default handler returns a bare 500 with
    no body at all for anything we didn't explicitly raise as an
    HTTPException — fine for end users, useless for whoever's chasing the
    bug. Always logged (and sent to Sentry, same as before this handler
    existed — raising again after logging would just re-trigger this
    same handler, so this IS the reporting point now). The response body
    only changes when PlatformSettings.debug_mode is on: real exception
    type/message/traceback instead of a generic message — see Platform
    Settings ▸ System. Still a 500, not a crash: the request this
    happened on fails either way, every OTHER request keeps working."""
    logger.exception("Unhandled exception on %s %s", request.method, request.url.path)

    debug_mode = False
    try:
        async with AsyncSessionLocal() as db:
            result = await db.execute(select(PlatformSettings.debug_mode).where(PlatformSettings.id == SINGLETON_ID))
            debug_mode = bool(result.scalar_one_or_none())
    except Exception:
        # The DB itself may be what's broken — don't let checking the
        # flag mask the original error with a different one.
        pass

    if debug_mode:
        return JSONResponse(
            status_code=500,
            content={
                "detail": f"{type(exc).__name__}: {exc}",
                "debug": True,
                "traceback": traceback.format_exc(),
            },
        )
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})

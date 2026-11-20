import asyncio
import logging
import traceback

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import select

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.database import AsyncSessionLocal
from app.models.platform_settings import SINGLETON_ID, PlatformSettings
from app.services import notification_service

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

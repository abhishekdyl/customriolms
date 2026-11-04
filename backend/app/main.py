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

if settings.SENTRY_DSN:
    sentry_sdk.init(dsn=settings.SENTRY_DSN, environment=settings.ENV, traces_sample_rate=0.1)

logger = logging.getLogger(__name__)

app = FastAPI(title=settings.APP_NAME)

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

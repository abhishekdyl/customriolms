"""Super Admin's Usage Monitoring page — storage, per-org request load,
and activity, across every org on the platform. See models/
org_request_stat.py and server_health_service.py for the two pieces
this doesn't own (the daily counters table, and the live CPU/RAM/disk
snapshot); this file is the aggregation + the request-stat writer.
"""
import logging
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import AsyncSessionLocal
from app.models.app_activity_day import AppActivityDay
from app.models.file import FileRecord
from app.models.org import Org
from app.models.org_request_stat import OrgRequestStat
from app.models.user import User
from app.models.notification import WhatsAppLog
from app.models.live_class import LiveClass

logger = logging.getLogger(__name__)


async def record_request(org_id: str, duration_ms: int, is_error: bool) -> None:
    """Best-effort, fire-and-forget (see app/main.py's middleware — this
    runs in a background task AFTER the response is already on its way
    back to the client, so it can never add latency to a real request,
    and a failure here is logged and swallowed, never surfaced to the
    user whose request this was)."""
    try:
        today = datetime.now(timezone.utc).date()
        async with AsyncSessionLocal() as db:
            stmt = pg_insert(OrgRequestStat).values(
                org_id=org_id, stat_date=today, request_count=1,
                total_duration_ms=duration_ms, error_count=1 if is_error else 0,
            )
            stmt = stmt.on_conflict_do_update(
                index_elements=[OrgRequestStat.org_id, OrgRequestStat.stat_date],
                set_={
                    "request_count": OrgRequestStat.request_count + 1,
                    "total_duration_ms": OrgRequestStat.total_duration_ms + duration_ms,
                    "error_count": OrgRequestStat.error_count + (1 if is_error else 0),
                },
            )
            await db.execute(stmt)
            await db.commit()
    except Exception:
        logger.exception("record_request failed for org %s", org_id)


async def record_activity(org_id: str, user_id: str) -> None:
    """Role-agnostic "Active Today" signal — any authenticated request
    from any role marks that user active for today (see
    models/app_activity_day.py's docstring for why this is a separate
    table from the learner-only streak one). Same best-effort,
    fire-and-forget shape as record_request above."""
    try:
        today = datetime.now(timezone.utc).date()
        async with AsyncSessionLocal() as db:
            stmt = pg_insert(AppActivityDay).values(user_id=user_id, day=today, org_id=org_id).on_conflict_do_nothing()
            await db.execute(stmt)
            await db.commit()
    except Exception:
        logger.exception("record_activity failed for org %s user %s", org_id, user_id)


# ---- Storage ----

# component -> the human-facing "type" bucket shown in the storage
# breakdown donut. Mirrors the component values storage_service/file.py
# actually write (see FileRecord's docstring for the full component/
# filearea list) — anything not recognized here falls into "other".
_STORAGE_TYPE_BY_COMPONENT = {
    "mod_watch": "Video", "mod_read": "Document", "mod_scorm": "SCORM package",
    "question": "Quiz images", "user": "Avatars", "org": "Branding",
}


def _storage_type(component: str) -> str:
    return _STORAGE_TYPE_BY_COMPONENT.get(component, "Other")


async def _storage_by_org(db: AsyncSession) -> dict:
    """Total bytes per org — summed over DISTINCT contenthash per org,
    not every FileRecord row, so a video reused across five modules in
    the same org counts once (it only occupies disk once for that org
    too — see storage_service's dedup docstring). Cheapest correct way
    to do that in SQL: aggregate over one row per (org_id, contenthash)."""
    rows = (await db.execute(
        select(FileRecord.org_id, FileRecord.contenthash, func.max(FileRecord.filesize).label("size"))
        .group_by(FileRecord.org_id, FileRecord.contenthash)
    )).all()
    totals: dict = {}
    for org_id, _hash, size in rows:
        totals[org_id] = totals.get(org_id, 0) + (size or 0)
    return totals


async def _storage_breakdown_for_org(db: AsyncSession, org_id) -> list[dict]:
    rows = (await db.execute(
        select(FileRecord.component, FileRecord.contenthash, func.max(FileRecord.filesize).label("size"))
        .where(FileRecord.org_id == org_id)
        .group_by(FileRecord.component, FileRecord.contenthash)
    )).all()
    by_type: dict[str, int] = {}
    for component, _hash, size in rows:
        t = _storage_type(component)
        by_type[t] = by_type.get(t, 0) + (size or 0)
    return [{"type": t, "bytes": b} for t, b in sorted(by_type.items(), key=lambda kv: -kv[1])]


# ---- Users ----

async def _user_counts_by_org(db: AsyncSession) -> dict:
    rows = (await db.execute(select(User.org_id, func.count(User.id)).group_by(User.org_id))).all()
    return dict(rows)


# ---- Activity (DAU) ----

async def _dau_today_by_org(db: AsyncSession) -> dict:
    today = datetime.now(timezone.utc).date()
    rows = (await db.execute(
        select(AppActivityDay.org_id, func.count(func.distinct(AppActivityDay.user_id)))
        .where(AppActivityDay.day == today)
        .group_by(AppActivityDay.org_id)
    )).all()
    return dict(rows)


async def _dau_trend_for_org(db: AsyncSession, org_id, days: int) -> list[dict]:
    since = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    rows = (await db.execute(
        select(AppActivityDay.day, func.count(func.distinct(AppActivityDay.user_id)))
        .where(AppActivityDay.org_id == org_id, AppActivityDay.day >= since)
        .group_by(AppActivityDay.day)
        .order_by(AppActivityDay.day)
    )).all()
    by_day = {d: c for d, c in rows}
    return _fill_series(by_day, since, days)


# ---- Request load ----

async def _requests_today_by_org(db: AsyncSession) -> dict:
    today = datetime.now(timezone.utc).date()
    rows = (await db.execute(
        select(OrgRequestStat.org_id, OrgRequestStat.request_count, OrgRequestStat.total_duration_ms)
        .where(OrgRequestStat.stat_date == today)
    )).all()
    return {org_id: {"requests": rc, "avg_ms": round(td / rc) if rc else 0} for org_id, rc, td in rows}


async def _request_trend_for_org(db: AsyncSession, org_id, days: int) -> list[dict]:
    since = datetime.now(timezone.utc).date() - timedelta(days=days - 1)
    rows = (await db.execute(
        select(OrgRequestStat.stat_date, OrgRequestStat.request_count)
        .where(OrgRequestStat.org_id == org_id, OrgRequestStat.stat_date >= since)
        .order_by(OrgRequestStat.stat_date)
    )).all()
    by_day = {d: c for d, c in rows}
    return _fill_series(by_day, since, days)


def _fill_series(by_day: dict, since: date, days: int) -> list[dict]:
    """Every day in the range gets a point, 0 where there's no row — a
    trend chart with gaps looks broken, not "quiet"."""
    out = []
    for i in range(days):
        d = since + timedelta(days=i)
        out.append({"date": d.isoformat(), "value": by_day.get(d, 0)})
    return out


# ---- Public: the table (list) and the drill-down (detail) ----

async def list_org_usage(db: AsyncSession) -> list[dict]:
    orgs = (await db.execute(select(Org))).scalars().all()
    storage = await _storage_by_org(db)
    user_counts = await _user_counts_by_org(db)
    dau = await _dau_today_by_org(db)
    requests_today = await _requests_today_by_org(db)

    out = []
    for org in orgs:
        storage_bytes = storage.get(org.id, 0)
        storage_mb = storage_bytes / (1024 * 1024)
        req = requests_today.get(org.id, {"requests": 0, "avg_ms": 0})
        out.append({
            "org_id": org.id, "org_name": org.name, "org_slug": org.slug, "plan": org.plan, "status": org.status,
            "user_count": user_counts.get(org.id, 0), "user_limit": org.user_limit,
            "storage_mb": round(storage_mb, 1), "storage_limit_mb": org.storage_limit_mb,
            "storage_percent": round(min(storage_mb / org.storage_limit_mb * 100, 999), 1) if org.storage_limit_mb else 0,
            "requests_today": req["requests"], "avg_response_ms": req["avg_ms"],
            "active_users_today": dau.get(org.id, 0),
        })
    return out


async def org_usage_detail(db: AsyncSession, org_id, days: int) -> dict:
    org = await db.get(Org, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    storage = await _storage_by_org(db)
    user_counts = await _user_counts_by_org(db)
    storage_bytes = storage.get(org.id, 0)
    storage_mb = storage_bytes / (1024 * 1024)

    since_dt = datetime.now(timezone.utc) - timedelta(days=days)
    live_class_rows = (await db.execute(
        select(func.count(LiveClass.id), func.coalesce(func.sum(LiveClass.duration_minutes), 0))
        .where(LiveClass.org_id == org_id, LiveClass.created_at >= since_dt)
    )).one()
    whatsapp_count = (await db.execute(
        select(func.count(WhatsAppLog.id)).where(
            WhatsAppLog.org_id == org_id, WhatsAppLog.created_at >= since_dt, WhatsAppLog.status == "sent",
        )
    )).scalar_one()

    return {
        "org_id": org.id, "org_name": org.name, "org_slug": org.slug, "plan": org.plan, "status": org.status,
        "user_count": user_counts.get(org.id, 0), "user_limit": org.user_limit,
        "storage_mb": round(storage_mb, 1), "storage_limit_mb": org.storage_limit_mb,
        "storage_percent": round(min(storage_mb / org.storage_limit_mb * 100, 999), 1) if org.storage_limit_mb else 0,
        "storage_breakdown": await _storage_breakdown_for_org(db, org_id),
        "dau_trend": await _dau_trend_for_org(db, org_id, days),
        "request_trend": await _request_trend_for_org(db, org_id, days),
        "live_class_count": live_class_rows[0], "live_class_minutes": live_class_rows[1],
        "whatsapp_messages": whatsapp_count,
    }

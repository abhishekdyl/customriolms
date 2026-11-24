"""Live Classes — scheduling (status derivation, audience resolution)
plus the two provider integrations (BigBlueButton, Zoom). See
LiveClass's own docstring for the data model and Org's bbb_*/zoom_*
fields for where credentials live — each org configures its OWN
BigBlueButton server and Zoom account from its own Org Settings page,
there's no platform-wide shared credential.

Neither provider is contacted unless that org's own credentials are
filled in — available_providers() is what the "Schedule a live class"
form and the create/update endpoints both gate on, so a provider with
nothing configured never gets this far.
"""
import base64
import hashlib
import time
import uuid
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.live_class import LiveClass, LiveClassProvider, LiveClassTargetScope
from app.models.org import Org
from app.models.user import RoleName, User, UserStatus
from app.schemas.live_class import JoinOut

BBB_TIMEOUT = httpx.Timeout(15.0)
ZOOM_TIMEOUT = httpx.Timeout(15.0)

# Cached Zoom access token, keyed by org id — each org has its own Zoom
# Server-to-Server OAuth app now (see Org.zoom_*), and a token lasts
# ~1h, so caching per org avoids re-minting one on every single call
# without ever mixing up two orgs' tokens.
_zoom_token_cache: dict[str, tuple[str, float]] = {}


def available_providers(org: Org) -> list[str]:
    providers = []
    if org.bbb_server_url and org.bbb_shared_secret:
        providers.append(LiveClassProvider.BIGBLUEBUTTON)
    if org.zoom_account_id and org.zoom_client_id and org.zoom_client_secret:
        providers.append(LiveClassProvider.ZOOM)
    return providers


def compute_status(lc: LiveClass, now: datetime | None = None) -> str:
    now = now or datetime.now(timezone.utc)
    start = lc.scheduled_start
    end = start + timedelta(minutes=lc.duration_minutes)
    if now < start:
        return "scheduled"
    if now <= end:
        return "live"
    return "ended"


def is_host(lc: LiveClass, user: User) -> bool:
    """Who gets the moderator/host URL instead of the attendee one —
    whoever scheduled it, or anyone with org-wide live_classes.manage
    access (Org/Super Admin, or an instructor custom role granted it),
    so a class never gets stuck with only one person able to start it."""
    if lc.created_by == user.id:
        return True
    return user.role in (RoleName.SUPER_ADMIN, RoleName.ORG_ADMIN)


async def recipients_for_class(db: AsyncSession, lc: LiveClass) -> list[User]:
    """Same split as ReminderRule's recipients_for_rule, plus "individual"
    (a hand-picked user_ids list) and "team" (one team's members
    directly, not via any course's own assigned_team_ids) — two audience
    shapes a plain course/all split can't express on its own."""
    if lc.target_scope == LiveClassTargetScope.INDIVIDUAL:
        if not lc.user_ids:
            return []
        rows = (await db.execute(
            select(User).where(User.id.in_(lc.user_ids), User.org_id == lc.org_id, User.status == UserStatus.ACTIVE)
        )).scalars().all()
        return list(rows)
    if lc.target_scope == LiveClassTargetScope.TEAM and lc.team_id is not None:
        rows = (await db.execute(
            select(User).where(User.team_id == lc.team_id, User.org_id == lc.org_id, User.status == UserStatus.ACTIVE)
        )).scalars().all()
        return list(rows)
    if lc.target_scope == LiveClassTargetScope.COURSE and lc.course_id is not None:
        course = await db.get(Course, lc.course_id)
        if course is None or course.org_id != lc.org_id:
            return []
        rows = (await db.execute(select(User).where(User.org_id == lc.org_id, User.status == UserStatus.ACTIVE))).scalars().all()
        assigned_users = set(course.assigned_user_ids or [])
        assigned_teams = set(course.assigned_team_ids or [])
        return [u for u in rows if u.id in assigned_users or (u.team_id is not None and u.team_id in assigned_teams)]
    rows = (await db.execute(select(User).where(User.org_id == lc.org_id, User.status == UserStatus.ACTIVE))).scalars().all()
    return list(rows)


async def can_access(db: AsyncSession, lc: LiveClass, user: User) -> bool:
    """Gate for both "does this show up on my calendar" and "can I hit
    join" — everyone with org-wide manage access can always see/join
    every class in their org (same reasoning as is_host above); anyone
    else only if they're an actual recipient."""
    if user.org_id != lc.org_id:
        return False
    if is_host(lc, user) or user.role == RoleName.SUPER_ADMIN:
        return True
    recipients = await recipients_for_class(db, lc)
    return any(r.id == user.id for r in recipients)


# ---------------------------------------------------------------- BBB --

def _bbb_checksum(secret: str, call: str, query: str) -> str:
    # BBB's long-standing default: sha1(apiCallName + queryString + sharedSecret).
    return hashlib.sha1(f"{call}{query}{secret}".encode()).hexdigest()


def _bbb_url(server_url: str, secret: str, call: str, params: dict) -> str:
    base = server_url.rstrip("/") + "/"
    query = urlencode(params)
    checksum = _bbb_checksum(secret, call, query)
    return f"{base}api/{call}?{query}&checksum={checksum}"


async def _ensure_bbb_meeting(db: AsyncSession, lc: LiveClass, org: Org) -> None:
    """Idempotent — safe to call every time someone joins, not just the
    first time (BBB's own create API returns the existing meeting's
    info rather than resetting it if it's already running); bbb_created
    just avoids a pointless network round-trip on every subsequent
    join once we already know it exists."""
    if lc.bbb_created and lc.bbb_meeting_id:
        return
    if not lc.bbb_meeting_id:
        lc.bbb_meeting_id = f"riolms-{lc.id.hex}"
        lc.bbb_moderator_pw = uuid.uuid4().hex[:12]
        lc.bbb_attendee_pw = uuid.uuid4().hex[:12]
    url = _bbb_url(org.bbb_server_url, org.bbb_shared_secret, "create", {
        "meetingID": lc.bbb_meeting_id,
        "name": lc.title,
        "moderatorPW": lc.bbb_moderator_pw,
        "attendeePW": lc.bbb_attendee_pw,
        "duration": lc.duration_minutes,
        "record": "true",
    })
    try:
        async with httpx.AsyncClient(timeout=BBB_TIMEOUT) as client:
            resp = await client.get(url)
        if resp.status_code != 200 or "<returncode>SUCCESS</returncode>" not in resp.text:
            raise HTTPException(status_code=502, detail="Couldn't reach your BigBlueButton server — check its URL/shared secret in Org Settings")
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Couldn't reach your BigBlueButton server — check its URL/shared secret in Org Settings")
    lc.bbb_created = True
    await db.commit()


def _bbb_join_url(lc: LiveClass, org: Org, user: User, host: bool) -> str:
    password = lc.bbb_moderator_pw if host else lc.bbb_attendee_pw
    full_name = f"{user.firstname} {user.lastname}".strip() or user.email
    return _bbb_url(org.bbb_server_url, org.bbb_shared_secret, "join", {
        "meetingID": lc.bbb_meeting_id,
        "fullName": full_name,
        "password": password,
        "redirect": "true",
    })


# --------------------------------------------------------------- Zoom --

async def _zoom_access_token(org: Org) -> str:
    cache_key = str(org.id)
    cached = _zoom_token_cache.get(cache_key)
    if cached and cached[1] > time.time() + 30:
        return cached[0]
    basic = base64.b64encode(f"{org.zoom_client_id}:{org.zoom_client_secret}".encode()).decode()
    try:
        async with httpx.AsyncClient(timeout=ZOOM_TIMEOUT) as client:
            resp = await client.post(
                "https://zoom.us/oauth/token",
                params={"grant_type": "account_credentials", "account_id": org.zoom_account_id},
                headers={"Authorization": f"Basic {basic}"},
            )
        if resp.status_code != 200:
            raise HTTPException(status_code=502, detail="Couldn't authenticate with Zoom — check the Server-to-Server OAuth credentials in Org Settings")
        data = resp.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Couldn't reach Zoom — check your network access and Zoom credentials")
    token = data["access_token"]
    _zoom_token_cache[cache_key] = (token, time.time() + data.get("expires_in", 3600))
    return token


async def create_zoom_meeting(lc: LiveClass, org: Org) -> None:
    """Called once, right when a Zoom class is scheduled (not lazily
    like BBB — see LiveClass's docstring for why the two providers
    differ here)."""
    token = await _zoom_access_token(org)
    try:
        async with httpx.AsyncClient(timeout=ZOOM_TIMEOUT) as client:
            resp = await client.post(
                "https://api.zoom.us/v2/users/me/meetings",
                headers={"Authorization": f"Bearer {token}"},
                json={
                    "topic": lc.title,
                    "type": 2,  # scheduled
                    "start_time": lc.scheduled_start.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "duration": lc.duration_minutes,
                    "settings": {"join_before_host": False, "waiting_room": True},
                },
            )
        if resp.status_code != 201:
            raise HTTPException(status_code=502, detail=f"Zoom rejected the meeting request: {resp.text[:200]}")
        data = resp.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Couldn't reach Zoom to create the meeting")
    lc.zoom_meeting_id = str(data["id"])
    lc.zoom_join_url = data["join_url"]
    lc.zoom_start_url = data["start_url"]


async def delete_zoom_meeting(lc: LiveClass, org: Org) -> None:
    """Best-effort — called when a Zoom class is cancelled/deleted so
    it doesn't linger in the host's own Zoom account; a failure here
    (meeting already gone, Zoom unreachable) shouldn't block deleting
    our own row, so callers should swallow this, not propagate it."""
    if not lc.zoom_meeting_id:
        return
    token = await _zoom_access_token(org)
    async with httpx.AsyncClient(timeout=ZOOM_TIMEOUT) as client:
        await client.delete(f"https://api.zoom.us/v2/meetings/{lc.zoom_meeting_id}", headers={"Authorization": f"Bearer {token}"})


# ------------------------------------------------------------- Join API --

async def get_join_url(db: AsyncSession, lc: LiveClass, org: Org, user: User) -> JoinOut:
    host = is_host(lc, user)
    if lc.provider == LiveClassProvider.BIGBLUEBUTTON:
        await _ensure_bbb_meeting(db, lc, org)
        return JoinOut(join_url=_bbb_join_url(lc, org, user, host), is_host=host)
    if lc.provider == LiveClassProvider.ZOOM:
        url = lc.zoom_start_url if host else lc.zoom_join_url
        if not url:
            raise HTTPException(status_code=500, detail="This class's Zoom meeting wasn't created properly — ask an admin to re-save it")
        return JoinOut(join_url=url, is_host=host)
    raise HTTPException(status_code=400, detail=f"Unknown provider: {lc.provider}")

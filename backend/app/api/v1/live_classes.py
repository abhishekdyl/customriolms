import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_capability
from app.core.database import get_db
from app.models.course import Course
from app.models.live_class import LiveClass, LiveClassProvider
from app.models.org import Org
from app.models.team import Team
from app.models.user import RoleName, User
from app.schemas.live_class import JoinOut, LiveClassIn, LiveClassOut
from app.schemas.notification import BroadcastPreviewOut, BroadcastResultOut, BroadcastTargetIn
from app.services import live_class_service as svc
from app.services import whatsapp_service as wa_svc
from app.services.notification_service import get_owned
from app.services.permission_service import is_team_scoped

router = APIRouter(prefix="/api/v1/live-classes", tags=["live-classes"])


async def _org(db: AsyncSession, org_id: uuid.UUID) -> Org:
    """Each org's own BBB/Zoom credentials live on its Org row (Org
    Settings' self-service "Live Classes" section) — no platform-wide
    singleton here, unlike PlatformSettings."""
    org = await db.get(Org, org_id)
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")
    return org


async def _to_out(db: AsyncSession, lc: LiveClass) -> LiveClassOut:
    course_title = None
    if lc.course_id is not None:
        course = await db.get(Course, lc.course_id)
        course_title = course.title if course else None
    team_name = None
    if lc.team_id is not None:
        team = await db.get(Team, lc.team_id)
        team_name = team.name if team else None
    creator = await db.get(User, lc.created_by)
    created_by_name = f"{creator.firstname} {creator.lastname}".strip() if creator else None
    return LiveClassOut.model_validate({
        **lc.__dict__, "course_title": course_title, "team_name": team_name, "created_by_name": created_by_name,
        "status": svc.compute_status(lc),
    })


def _enforce_team_scope(body: LiveClassIn, user: User, existing_course_id: uuid.UUID | None = None) -> None:
    """A team-scoped instructor (Team Lead, or a custom role with
    OWN_TEAM scope) granted live_classes.manage can schedule classes
    for their own team's reach only — never "all" (that would blast
    the whole org), and only for courses/users/teams within their own
    team. Org/Super Admin are never team-scoped, so this is a no-op
    for them."""
    if not is_team_scoped(user):
        return
    if body.target_scope == "all":
        raise HTTPException(status_code=403, detail="Only an Org Admin can schedule a live class for the whole org")
    if body.target_scope == "individual" and user.team_id is None:
        raise HTTPException(status_code=403, detail="You're not assigned to a team, so you can't pick individual users")
    if body.target_scope == "team" and body.team_id != user.team_id:
        raise HTTPException(status_code=403, detail="You can only target your own team")


@router.get("/providers", response_model=list[str])
async def list_providers(db: AsyncSession = Depends(get_db), user: User = Depends(require_capability("live_classes.manage"))):
    """Which providers the "Schedule a live class" form should offer —
    only ones this org's own Org Admin has actually put credentials in
    for (see Org Settings' Live Classes section)."""
    return svc.available_providers(await _org(db, user.org_id))


@router.get("", response_model=list[LiveClassOut])
async def list_live_classes(db: AsyncSession = Depends(get_db), user: User = Depends(require_capability("live_classes.manage"))):
    rows = (await db.execute(select(LiveClass).where(LiveClass.org_id == user.org_id).order_by(LiveClass.scheduled_start.desc()))).scalars().all()
    return [await _to_out(db, lc) for lc in rows]


@router.post("", response_model=LiveClassOut, status_code=201)
async def create_live_class(body: LiveClassIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_capability("live_classes.manage"))):
    org = await _org(db, user.org_id)
    if body.provider not in svc.available_providers(org):
        raise HTTPException(status_code=400, detail=f"{body.provider} isn't configured — add its credentials in Org Settings first")
    if body.course_id is not None:
        await get_owned(db, Course, body.course_id, user.org_id)  # 404s if it's not this org's course
    if body.team_id is not None:
        await get_owned(db, Team, body.team_id, user.org_id)  # 404s if it's not this org's team
    _enforce_team_scope(body, user)

    lc = LiveClass(org_id=user.org_id, created_by=user.id, **body.model_dump())
    if lc.provider == LiveClassProvider.ZOOM:
        await svc.create_zoom_meeting(lc, org)
    db.add(lc)
    await db.commit()
    await db.refresh(lc)
    return await _to_out(db, lc)


@router.patch("/{live_class_id}", response_model=LiveClassOut)
async def update_live_class(live_class_id: uuid.UUID, body: LiveClassIn, db: AsyncSession = Depends(get_db), user: User = Depends(require_capability("live_classes.manage"))):
    lc = await get_owned(db, LiveClass, live_class_id, user.org_id)
    org = await _org(db, user.org_id)
    if body.provider not in svc.available_providers(org):
        raise HTTPException(status_code=400, detail=f"{body.provider} isn't configured — add its credentials in Org Settings first")
    if body.course_id is not None:
        await get_owned(db, Course, body.course_id, user.org_id)
    if body.team_id is not None:
        await get_owned(db, Team, body.team_id, user.org_id)
    _enforce_team_scope(body, user)

    provider_changed = lc.provider != body.provider
    time_changed = lc.scheduled_start != body.scheduled_start or lc.duration_minutes != body.duration_minutes
    old_zoom_id = lc.zoom_meeting_id
    for k, v in body.model_dump().items():
        setattr(lc, k, v)
    if lc.provider == LiveClassProvider.ZOOM and (provider_changed or not lc.zoom_meeting_id or time_changed):
        await svc.create_zoom_meeting(lc, org)
        if provider_changed and old_zoom_id:
            pass  # old BBB fields just go unused; nothing to clean up externally
    if lc.provider == LiveClassProvider.BIGBLUEBUTTON and provider_changed:
        lc.zoom_meeting_id = lc.zoom_join_url = lc.zoom_start_url = None
        lc.bbb_created = False  # next join re-creates it under the (possibly changed) title/duration

    await db.commit()
    await db.refresh(lc)
    return await _to_out(db, lc)


@router.delete("/{live_class_id}", status_code=204)
async def delete_live_class(live_class_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(require_capability("live_classes.manage"))):
    lc = await get_owned(db, LiveClass, live_class_id, user.org_id)
    if lc.provider == LiveClassProvider.ZOOM and lc.zoom_meeting_id:
        org = await _org(db, user.org_id)
        try:
            await svc.delete_zoom_meeting(lc, org)
        except Exception:
            pass  # best-effort — see delete_zoom_meeting's docstring
    await db.delete(lc)
    await db.commit()


@router.post("/{live_class_id}/notify-whatsapp/preview", response_model=BroadcastPreviewOut)
async def preview_webinar_notification(
    live_class_id: uuid.UUID, body: BroadcastTargetIn, db: AsyncSession = Depends(get_db),
    user: User = Depends(require_capability("live_classes.manage")),
):
    lc = await get_owned(db, LiveClass, live_class_id, user.org_id)
    course = await db.get(Course, lc.course_id) if lc.course_id else None
    users = await wa_svc.resolve_broadcast_targets(db, user.org_id, body, course)
    recipient_count, without_phone_count = wa_svc.preview_counts(users)
    return BroadcastPreviewOut(recipient_count=recipient_count, without_phone_count=without_phone_count)


@router.post("/{live_class_id}/notify-whatsapp", response_model=BroadcastResultOut)
async def send_webinar_notification(
    live_class_id: uuid.UUID, body: BroadcastTargetIn, db: AsyncSession = Depends(get_db),
    user: User = Depends(require_capability("live_classes.manage")),
):
    """"Notify via WhatsApp" on a live class — tells recipients a session
    is scheduled and points them at the Calendar page to join."""
    lc = await get_owned(db, LiveClass, live_class_id, user.org_id)
    course = await db.get(Course, lc.course_id) if lc.course_id else None
    users = await wa_svc.resolve_broadcast_targets(db, user.org_id, body, course)
    when_label = lc.scheduled_start.strftime("%d %b %Y, %I:%M %p")
    sent, failed, skipped = await wa_svc.send_webinar_notification(db, user.org_id, lc.title, when_label, users)
    return BroadcastResultOut(sent=sent, failed=failed, skipped=skipped)


# ---------- Every org member's own view (no live_classes.manage needed) ----------

@router.get("/mine", response_model=list[LiveClassOut])
async def list_my_live_classes(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Powers the learner Calendar page — every class this user can
    actually see: ones they're a named recipient of, plus every class
    in the org if they're an Org/Super Admin (matches svc.can_access)."""
    rows = (await db.execute(select(LiveClass).where(LiveClass.org_id == user.org_id))).scalars().all()
    visible = [lc for lc in rows if await svc.can_access(db, lc, user)]
    return [await _to_out(db, lc) for lc in visible]


@router.post("/{live_class_id}/join", response_model=JoinOut)
async def join_live_class(live_class_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    lc = await db.get(LiveClass, live_class_id)
    if lc is None or lc.org_id != user.org_id:
        raise HTTPException(status_code=404, detail="Not found")
    if not await svc.can_access(db, lc, user):
        raise HTTPException(status_code=403, detail="You're not invited to this live class")
    status = svc.compute_status(lc)
    if status == "ended":
        raise HTTPException(status_code=400, detail="This session has already ended")
    host = svc.is_host(lc, user)
    if status == "scheduled" and not host:
        raise HTTPException(status_code=400, detail="This session hasn't started yet — the host needs to join first")
    org = await _org(db, user.org_id)
    return await svc.get_join_url(db, lc, org, user)

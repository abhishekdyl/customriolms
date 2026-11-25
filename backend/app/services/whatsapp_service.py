import logging
import re
import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.phone import whatsapp_recipient
from app.models.course import Course
from app.models.notification import OrgWhatsAppSettings, WhatsAppLog, WhatsAppTemplate
from app.models.team import Team
from app.models.user import User, UserStatus
from app.schemas.notification import (
    BroadcastTargetIn, WhatsAppKind, WhatsAppSettingsIn, WhatsAppSettingsOut, WhatsAppTemplateIn,
)

logger = logging.getLogger(__name__)

SENDZEN_BASE_URL = "https://api.sendzen.io/v1/messages"

# Seeded the first time an org opens the WhatsApp tab, same pattern as
# notification_service's DEFAULT_TEMPLATES/DEFAULT_RULES — gives every
# org a row to fill in per kind rather than conjuring one on first send.
DEFAULT_WHATSAPP_TEMPLATES: list[WhatsAppKind] = ["certificate_earned", "course_launch", "webinar_scheduled"]


# ---------- settings ----------
async def get_settings(db: AsyncSession, org_id: uuid.UUID) -> OrgWhatsAppSettings:
    row = await db.get(OrgWhatsAppSettings, org_id)
    if row is None:
        row = OrgWhatsAppSettings(org_id=org_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def settings_out(row: OrgWhatsAppSettings) -> WhatsAppSettingsOut:
    return WhatsAppSettingsOut(enabled=row.enabled, has_api_key=bool(row.api_key), from_number=row.from_number)


async def save_settings(db: AsyncSession, org_id: uuid.UUID, body: WhatsAppSettingsIn) -> OrgWhatsAppSettings:
    row = await get_settings(db, org_id)
    row.enabled = body.enabled
    if body.api_key:  # blank = keep existing
        row.api_key = body.api_key
    row.from_number = body.from_number.strip()
    await db.commit()
    await db.refresh(row)
    return row


# ---------- templates ----------
async def list_templates(db: AsyncSession, org_id: uuid.UUID) -> list[WhatsAppTemplate]:
    rows = (await db.execute(select(WhatsAppTemplate).where(WhatsAppTemplate.org_id == org_id))).scalars().all()
    have = {r.kind for r in rows}
    missing = [k for k in DEFAULT_WHATSAPP_TEMPLATES if k not in have]
    if missing:
        for kind in missing:
            db.add(WhatsAppTemplate(org_id=org_id, kind=kind))
        await db.commit()
        rows = (await db.execute(select(WhatsAppTemplate).where(WhatsAppTemplate.org_id == org_id))).scalars().all()
    return sorted(rows, key=lambda r: DEFAULT_WHATSAPP_TEMPLATES.index(r.kind) if r.kind in DEFAULT_WHATSAPP_TEMPLATES else 99)


async def save_template(db: AsyncSession, org_id: uuid.UUID, body: WhatsAppTemplateIn) -> WhatsAppTemplate:
    row = (await db.execute(
        select(WhatsAppTemplate).where(WhatsAppTemplate.org_id == org_id, WhatsAppTemplate.kind == body.kind)
    )).scalar_one_or_none()
    if row is None:
        row = WhatsAppTemplate(org_id=org_id, kind=body.kind)
        db.add(row)
    row.template_name = body.template_name.strip()
    row.lang_code = body.lang_code.strip() or "en_US"
    await db.commit()
    await db.refresh(row)
    return row


async def _template_for(db: AsyncSession, org_id: uuid.UUID, kind: WhatsAppKind) -> WhatsAppTemplate | None:
    return (await db.execute(
        select(WhatsAppTemplate).where(WhatsAppTemplate.org_id == org_id, WhatsAppTemplate.kind == kind)
    )).scalar_one_or_none()


# ---------- log ----------
async def log_send(db: AsyncSession, org_id: uuid.UUID, to_phone: str, kind: str, status: str, detail: str = "") -> None:
    """Mirrors notification_service.log_email exactly — commits on its
    own so a logging failure never affects the send path itself."""
    db.add(WhatsAppLog(org_id=org_id, to_phone=to_phone, kind=kind, status=status, detail=detail[:300]))
    await db.commit()


async def list_log(db: AsyncSession, org_id: uuid.UUID, limit: int = 50) -> list[WhatsAppLog]:
    rows = (await db.execute(
        select(WhatsAppLog).where(WhatsAppLog.org_id == org_id).order_by(WhatsAppLog.created_at.desc()).limit(limit)
    )).scalars().all()
    return list(rows)


# ---------- SendZen HTTP call ----------
async def _send_template_message(
    settings_row: OrgWhatsAppSettings, to_phone: str, template_name: str, lang_code: str, body_params: list[str],
) -> tuple[bool, str]:
    """One call to SendZen's POST /v1/messages — the WhatsApp Cloud API
    wrapper this org has brought its own credentials for (api_key +
    from_number, set in Settings ▸ Notifications ▸ WhatsApp). Returns
    (ok, detail) — detail is either the provider's message id (success)
    or a short failure reason, same shape send_test_email uses for SMTP."""
    # Field is "lang_code", not "language" — confirmed against SendZen's
    # own dashboard/docs sample request (not the earlier secondary-source
    # research this was first built from). "components" is included only
    # when the template actually has body parameters, same as their
    # sample (a plain {"name": ..., "lang_code": ...} with no components
    # key at all for a parameter-less template).
    template: dict = {"name": template_name, "lang_code": lang_code}
    if body_params:
        template["components"] = [{"type": "body", "parameters": [{"type": "text", "text": p} for p in body_params]}]
    # SendZen's own sample sends "from" as plain digits, no "+" (same
    # shape as `to`) — normalize here so a from_number saved with a "+"
    # or stray spaces (e.g. "+91 7247824010") doesn't come back as
    # SendZen's own "Invalid 'From' Phone Number" rather than actually
    # sending. This does NOT fix a from_number that's simply wrong/not
    # provisioned on the SendZen project — only SendZen's dashboard
    # (Connected Numbers / Sandbox Number) says which ones are valid.
    from_digits = re.sub(r"\D", "", settings_row.from_number or "")
    payload = {
        "from": from_digits,
        "to": to_phone,
        "type": "template",
        "template": template,
    }
    try:
        # local_address="0.0.0.0" forces an IPv4 socket, skipping any IPv6
        # address SendZen's DNS returns — on a network with a broken/slow
        # IPv6 route, httpx otherwise tries that address first and can eat
        # the entire timeout budget on a connection that was never going
        # to complete, long before it would fall back to IPv4 (seen in
        # practice as a bare ConnectTimeout with no response at all, even
        # though the same host answers an IPv4-only request instantly).
        transport = httpx.AsyncHTTPTransport(local_address="0.0.0.0")
        async with httpx.AsyncClient(timeout=15, transport=transport) as client:
            resp = await client.post(
                SENDZEN_BASE_URL, json=payload,
                headers={"Authorization": f"Bearer {settings_row.api_key}", "Content-Type": "application/json"},
            )
        if resp.status_code >= 400:
            return False, f"SendZen {resp.status_code}: {resp.text[:200]}"
        data = resp.json() if resp.content else {}
        message_id = data.get("message_id") or data.get("id") or ""
        return True, message_id or "sent"
    except Exception as exc:
        return False, f"{type(exc).__name__}: {exc}"


async def send_test_message(db: AsyncSession, org_id: uuid.UUID, to_phone_raw: str) -> tuple[bool, str]:
    """"Send test message" button — uses whatever template is configured
    for course_launch (any configured kind would do; that one's picked
    just because it needs no extra context) so the admin can confirm
    their API key/from-number/template actually work end-to-end."""
    row = await get_settings(db, org_id)
    if not row.api_key or not row.from_number:
        return False, "Fill in and save your API key and WhatsApp Business number first."
    to_phone = whatsapp_recipient(to_phone_raw)
    if to_phone is None:
        return False, "That doesn't look like a valid WhatsApp number (include the country code, e.g. +91XXXXXXXXXX)."
    template = await _template_for(db, org_id, "course_launch")
    template_name = template.template_name if template else ""
    if not template_name:
        return False, "Set a template name for at least one message kind in the Templates section first."
    ok, detail = await _send_template_message(row, to_phone, template_name, template.lang_code, [])
    return ok, (f"Test message sent (id: {detail})." if ok else detail)


# ---------- target resolution (Course Launch / Webinar) ----------
async def resolve_broadcast_targets(db: AsyncSession, org_id: uuid.UUID, target: BroadcastTargetIn, course: Course | None) -> list[User]:
    """Who a Course Launch / Webinar WhatsApp broadcast actually goes to.
    Mirrors notification_service.recipients_for_rule / live_class_service.
    recipients_for_class exactly (direct + team assignment for "course"),
    plus "team" — every active member of one Team directly, with no
    course involved at all."""
    if target.scope == "individual":
        if not target.user_ids:
            return []
        rows = (await db.execute(
            select(User).where(User.id.in_(target.user_ids), User.org_id == org_id, User.status == UserStatus.ACTIVE)
        )).scalars().all()
        return list(rows)
    if target.scope == "team" and target.team_id is not None:
        rows = (await db.execute(
            select(User).where(User.team_id == target.team_id, User.org_id == org_id, User.status == UserStatus.ACTIVE)
        )).scalars().all()
        return list(rows)
    if target.scope == "course" and course is not None:
        rows = (await db.execute(select(User).where(User.org_id == org_id, User.status == UserStatus.ACTIVE))).scalars().all()
        assigned_users = set(course.assigned_user_ids or [])
        assigned_teams = set(course.assigned_team_ids or [])
        return [u for u in rows if u.id in assigned_users or (u.team_id is not None and u.team_id in assigned_teams)]
    rows = (await db.execute(select(User).where(User.org_id == org_id, User.status == UserStatus.ACTIVE))).scalars().all()
    return list(rows)


def preview_counts(users: list[User]) -> tuple[int, int]:
    """(recipient_count, without_phone_count) — the confirm-before-send
    numbers the admin sees ("23 users, 5 without a phone on file")."""
    without_phone = sum(1 for u in users if whatsapp_recipient(u.phone) is None)
    return len(users), without_phone


async def _send_to_many(db: AsyncSession, org_id: uuid.UUID, users: list[User], kind: WhatsAppKind, body_params_for: callable) -> tuple[int, int, int]:
    """Shared fan-out used by both broadcast sends below — resolves
    settings/template once, then attempts one message per user, logging
    every attempt (sent/failed/skipped) the same way EmailLog does.
    `body_params_for(user)` builds that one user's {{1}},{{2}}... values."""
    sent = failed = skipped = 0
    settings_row = await get_settings(db, org_id)
    if not settings_row.enabled or not settings_row.api_key or not settings_row.from_number:
        for u in users:
            await log_send(db, org_id, whatsapp_recipient(u.phone) or (u.phone or "—"), kind, "skipped", "WhatsApp isn't configured/enabled for this org")
        return 0, 0, len(users)
    template = await _template_for(db, org_id, kind)
    if template is None or not template.template_name:
        for u in users:
            await log_send(db, org_id, whatsapp_recipient(u.phone) or (u.phone or "—"), kind, "skipped", "No approved template configured for this message kind")
        return 0, 0, len(users)
    for u in users:
        to_phone = whatsapp_recipient(u.phone)
        if to_phone is None:
            await log_send(db, org_id, u.phone or "—", kind, "skipped", "No phone number on file for this user")
            skipped += 1
            continue
        ok, detail = await _send_template_message(settings_row, to_phone, template.template_name, template.lang_code, body_params_for(u))
        await log_send(db, org_id, to_phone, kind, "sent" if ok else "failed", detail)
        if ok:
            sent += 1
        else:
            failed += 1
    return sent, failed, skipped


async def send_certificate_notification(db: AsyncSession, user: User, course_title: str) -> None:
    """Best-effort, fire-and-forget (same contract as send_email_if_
    configured) — called right after a certificate is issued (see
    certificate_service.issue_certificate). Never raises: a WhatsApp
    misconfiguration or a missing phone number must never block the
    learner's certificate from being issued."""
    try:
        await _send_to_many(db, user.org_id, [user], "certificate_earned", lambda u: [u.full_name, course_title])
    except Exception:
        logger.exception("WhatsApp certificate notification failed for user %s", user.id)


async def send_course_launch_notification(db: AsyncSession, org_id: uuid.UUID, course_title: str, users: list[User]) -> tuple[int, int, int]:
    return await _send_to_many(db, org_id, users, "course_launch", lambda u: [u.full_name, course_title])


async def send_webinar_notification(db: AsyncSession, org_id: uuid.UUID, session_title: str, when_label: str, users: list[User]) -> tuple[int, int, int]:
    return await _send_to_many(db, org_id, users, "webinar_scheduled", lambda u: [u.full_name, session_title, when_label])

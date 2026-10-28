import asyncio
import smtplib
import ssl
import uuid
from datetime import datetime, timezone
from email.message import EmailMessage

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import EmailLog, NotificationTemplate, OrgSmtpSettings, PlatformSmtpSettings, ReminderRule
from app.models.org import Org
from app.models.platform_settings import SINGLETON_ID
from app.schemas.notification import OrgFallbackRequestOut, PlatformSmtpIn, PlatformSmtpOut, SmtpIn, SmtpOut

SIGN = "— {{org_name}} Learning"
DEFAULT_TEMPLATES = [
    ("Deadline approaching", "{{course_title}} is due soon",
     "Hi {{learner_name}},\n\nJust a reminder that \"{{course_title}}\" is due on {{due_date}}. You can pick up right where you left off.\n\n" + SIGN, True),
    ("Overdue notice", "{{course_title}} is now overdue",
     "Hi {{learner_name}},\n\n\"{{course_title}}\" was due on {{due_date}} and hasn't been completed yet. Please finish it as soon as possible.\n\n" + SIGN, True),
    ("Course assigned", "New course assigned: {{course_title}}",
     "Hi {{learner_name}},\n\nYou've been assigned \"{{course_title}}\" by {{manager_name}}. Due by {{due_date}}.\n\n" + SIGN, True),
    ("Certificate earned", "You earned a certificate!",
     "Congratulations {{learner_name}},\n\nYou've completed \"{{course_title}}\" and earned a certificate. View it in your app.\n\n" + SIGN, True),
    ("Welcome invite", "You're invited to {{org_name}} Learning",
     "Hi {{learner_name}},\n\n{{manager_name}} has invited you to {{org_name}}'s learning platform. Set your password to get started.\n\n" + SIGN, False),
]
DEFAULT_RULES = [
    ("before_due", 3, ["email", "inapp"], True),
    ("on_due", 0, ["email", "inapp"], True),
    ("overdue", 1, ["email", "inapp"], True),
    ("weekly_digest", 7, ["email"], False),
]


async def list_templates(db: AsyncSession, org_id: uuid.UUID) -> list[NotificationTemplate]:
    rows = (await db.execute(
        select(NotificationTemplate).where(NotificationTemplate.org_id == org_id).order_by(NotificationTemplate.created_at, NotificationTemplate.name)
    )).scalars().all()
    if not rows:  # first visit: seed the org with the standard set
        for i, (name, subject, body, editable) in enumerate(DEFAULT_TEMPLATES):
            db.add(NotificationTemplate(org_id=org_id, name=name, subject=subject, body=body, editable=editable))
        await db.commit()
        rows = (await db.execute(
            select(NotificationTemplate).where(NotificationTemplate.org_id == org_id).order_by(NotificationTemplate.created_at, NotificationTemplate.name)
        )).scalars().all()
    return list(rows)


async def list_rules(db: AsyncSession, org_id: uuid.UUID) -> list[ReminderRule]:
    q = select(ReminderRule).where(ReminderRule.org_id == org_id).order_by(ReminderRule.created_at, ReminderRule.id)
    rows = (await db.execute(q)).scalars().all()
    if not rows:
        for trigger, days, channels, enabled in DEFAULT_RULES:
            db.add(ReminderRule(org_id=org_id, trigger=trigger, days=days, channels=channels, enabled=enabled))
        await db.commit()
        rows = (await db.execute(q)).scalars().all()
    return list(rows)


async def get_owned(db: AsyncSession, model, obj_id: uuid.UUID, org_id: uuid.UUID):
    obj = await db.get(model, obj_id)
    if obj is None or obj.org_id != org_id:
        raise HTTPException(status_code=404, detail="Not found")
    return obj


async def get_smtp(db: AsyncSession, org_id: uuid.UUID) -> OrgSmtpSettings:
    row = await db.get(OrgSmtpSettings, org_id)
    if row is None:
        row = OrgSmtpSettings(org_id=org_id)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def smtp_out(row: OrgSmtpSettings) -> SmtpOut:
    return SmtpOut(
        use_custom=row.use_custom, host=row.host, port=row.port, encryption=row.encryption,
        username=row.username, has_password=bool(row.password), from_name=row.from_name, from_email=row.from_email,
        fallback_status=row.fallback_status,
    )


async def save_smtp(db: AsyncSession, org_id: uuid.UUID, body: SmtpIn) -> OrgSmtpSettings:
    row = await get_smtp(db, org_id)
    row.use_custom = body.use_custom
    row.host = body.host.strip()
    row.port = body.port
    row.encryption = body.encryption
    row.username = body.username.strip()
    if body.password:  # blank = keep existing
        row.password = body.password
    row.from_name = body.from_name.strip()
    row.from_email = body.from_email.strip()
    await db.commit()
    await db.refresh(row)
    return row


def _send_once(row, msg: EmailMessage, encryption: str) -> None:
    ctx = ssl.create_default_context()
    if encryption == "SSL":
        server = smtplib.SMTP_SSL(row.host, row.port, timeout=10, context=ctx)
    else:
        server = smtplib.SMTP(row.host, row.port, timeout=10)
    with server:
        if encryption == "TLS":
            server.starttls(context=ctx)
        if row.username:
            server.login(row.username, row.password)
        server.send_message(msg)


def _send_blocking(row, to_addr: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{row.from_name} <{row.from_email}>" if row.from_name else row.from_email
    msg["To"] = to_addr
    msg.set_content(body)
    try:
        _send_once(row, msg, row.encryption)
    except smtplib.SMTPServerDisconnected:
        # Very common misconfiguration: a provider's port only speaks
        # implicit SSL (e.g. 465) while the saved setting is TLS/STARTTLS
        # (or vice versa — some providers' "587" is implicit-SSL-only).
        # The server slams the connection shut immediately on the wrong
        # handshake, which is exactly this exception. The port number is a
        # much more reliable signal than the saved dropdown, so retry once
        # with the other protocol before giving up.
        fallback = "SSL" if row.encryption != "SSL" else "TLS"
        _send_once(row, msg, fallback)


async def send_test_email(row: OrgSmtpSettings, to_addr: str) -> tuple[bool, str]:
    if not row.host or not row.from_email:
        return False, "Couldn't connect — check host and credentials."
    try:
        await asyncio.to_thread(
            _send_blocking, row, to_addr,
            "Riosmart LMS — SMTP test", "This is a test email confirming your organization's SMTP settings work.",
        )
        return True, f"Test email sent successfully to {to_addr}."
    except Exception as exc:  # surface any connect/auth failure as a clean message
        return False, f"Couldn't connect — check host and credentials. ({type(exc).__name__})"


async def resolve_send_source(db: AsyncSession, org_id: uuid.UUID) -> tuple[object | None, str, str]:
    """3-tier resolution: an org's own SMTP wins if it's turned on and
    filled in; otherwise, only once a Super Admin has explicitly approved
    that org's request, fall back to the platform's shared SMTP; otherwise
    there's nowhere to send. Returns (row, "org"|"platform"|"none", why) —
    `why` is only meaningful when row is None, and says exactly which of
    the three tiers was missing/incomplete so a skipped send is self-
    diagnosable without reading the database directly."""
    org_row = await get_smtp(db, org_id)
    if org_row.use_custom:
        if org_row.host and org_row.from_email:
            return org_row, "org", ""
        return None, "none", "\"Use our own SMTP server\" is on but host or From-email is blank — finish and save that form"
    if org_row.fallback_status != "approved":
        label = {"none": "hasn't requested platform-SMTP access", "requested": "platform-SMTP request is still pending approval", "denied": "platform-SMTP request was denied"}
        return None, "none", f"This org {label.get(org_row.fallback_status, 'has no SMTP configured')}"
    plat_row = await get_platform_smtp(db)
    if plat_row.host and plat_row.from_email:
        return plat_row, "platform", ""
    return None, "none", "Platform-SMTP fallback is approved, but the Super Admin hasn't filled in the platform's own SMTP host/From-email yet (Platform Settings ▸ Email & Notifications)"


async def log_email(
    db: AsyncSession, org_id: uuid.UUID, to_addr: str, subject: str, source: str, status: str, detail: str = "",
) -> None:
    """Records one row in the "who got mailed what, when" audit trail
    (Notifications ▸ Sent mail log for an org; Platform Settings' cross-
    org view for a Super Admin). Commits on its own so a logging failure
    (or the caller's own transaction state) never affects the send path
    itself — this always runs after the send attempt is already decided."""
    db.add(EmailLog(org_id=org_id, to_addr=to_addr, subject=subject, source=source, status=status, detail=detail[:300]))
    await db.commit()


async def list_email_log(db: AsyncSession, org_id: uuid.UUID, limit: int = 50) -> list[EmailLog]:
    rows = (await db.execute(
        select(EmailLog).where(EmailLog.org_id == org_id).order_by(EmailLog.created_at.desc()).limit(limit)
    )).scalars().all()
    return list(rows)


async def list_platform_email_log(db: AsyncSession, limit: int = 200) -> list[tuple[EmailLog, str]]:
    rows = (await db.execute(
        select(EmailLog, Org.name)
        .join(Org, Org.id == EmailLog.org_id)
        .order_by(EmailLog.created_at.desc())
        .limit(limit)
    )).all()
    return [(log, org_name) for log, org_name in rows]


async def send_email_if_configured(db: AsyncSession, org_id: uuid.UUID, to_addr: str, subject: str, body: str) -> bool:
    """Best-effort send for transactional mail (password resets, etc.) that
    isn't itself the thing the caller is testing — unlike send_test_email,
    this never raises or reports a reason back to the caller, since the
    caller (e.g. forgot_password) must behave identically whether or not
    the email actually went out (no email-enumeration signal). Returns
    whether a send was even attempted, purely so the caller can log a
    dev-mode fallback when it wasn't. Resolves through the org's own SMTP
    first, then the platform's shared SMTP if that org has been approved
    to use it (see resolve_send_source); does nothing if neither applies.
    Every attempt — sent, failed, or skipped — is recorded (see
    list_email_log / list_platform_email_log) regardless of outcome."""
    row, source, why = await resolve_send_source(db, org_id)
    if row is None:
        await log_email(db, org_id, to_addr, subject, "none", "skipped", why)
        return False
    try:
        await asyncio.to_thread(_send_blocking, row, to_addr, subject, body)
    except Exception as exc:
        await log_email(db, org_id, to_addr, subject, source, "failed", f"{type(exc).__name__}: {exc}")
        return True  # best-effort — see docstring: caller still treats this as "attempted"
    await log_email(db, org_id, to_addr, subject, source, "sent")
    return True


# ---------- Platform SMTP (Super Admin's shared/fallback mail server) ----------
async def get_platform_smtp(db: AsyncSession) -> PlatformSmtpSettings:
    row = await db.get(PlatformSmtpSettings, SINGLETON_ID)
    if row is None:
        row = PlatformSmtpSettings(id=SINGLETON_ID)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def platform_smtp_out(row: PlatformSmtpSettings) -> PlatformSmtpOut:
    return PlatformSmtpOut(
        host=row.host, port=row.port, encryption=row.encryption, username=row.username,
        has_password=bool(row.password), from_name=row.from_name, from_email=row.from_email,
    )


async def save_platform_smtp(db: AsyncSession, body: PlatformSmtpIn) -> PlatformSmtpSettings:
    row = await get_platform_smtp(db)
    row.host = body.host.strip()
    row.port = body.port
    row.encryption = body.encryption
    row.username = body.username.strip()
    if body.password:  # blank = keep existing
        row.password = body.password
    row.from_name = body.from_name.strip()
    row.from_email = body.from_email.strip()
    await db.commit()
    await db.refresh(row)
    return row


# ---------- Org ▸ platform-SMTP fallback request/approval ----------
async def request_platform_fallback(db: AsyncSession, org_id: uuid.UUID) -> OrgSmtpSettings:
    row = await get_smtp(db, org_id)
    if row.fallback_status == "approved":
        return row  # already granted — nothing to (re-)request
    row.fallback_status = "requested"
    row.fallback_requested_at = datetime.now(timezone.utc)
    row.fallback_decided_at = None
    await db.commit()
    await db.refresh(row)
    return row


async def list_fallback_requests(db: AsyncSession) -> list[OrgFallbackRequestOut]:
    rows = (await db.execute(
        select(OrgSmtpSettings, Org.name)
        .join(Org, Org.id == OrgSmtpSettings.org_id)
        .where(OrgSmtpSettings.fallback_status != "none")
        .order_by(OrgSmtpSettings.fallback_requested_at.desc())
    )).all()
    return [
        OrgFallbackRequestOut(
            org_id=smtp.org_id, org_name=org_name, status=smtp.fallback_status,
            requested_at=smtp.fallback_requested_at, decided_at=smtp.fallback_decided_at,
        )
        for smtp, org_name in rows
    ]


async def decide_fallback_request(db: AsyncSession, org_id: uuid.UUID, approve: bool) -> OrgSmtpSettings:
    row = await get_smtp(db, org_id)
    if row.fallback_status not in ("requested", "approved", "denied"):
        raise HTTPException(status_code=400, detail="This org hasn't requested platform-SMTP access")
    row.fallback_status = "approved" if approve else "denied"
    row.fallback_decided_at = datetime.now(timezone.utc)
    await db.commit()
    await db.refresh(row)
    return row

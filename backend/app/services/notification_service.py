import asyncio
import logging
import smtplib
import ssl
import uuid
from datetime import date, datetime, timedelta, timezone
from email.message import EmailMessage
from zoneinfo import ZoneInfo

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.notification import EmailLog, NotificationTemplate, OrgSmtpSettings, PlatformSmtpSettings, ReminderRule
from app.models.org import Org
from app.models.platform_settings import SINGLETON_ID
from app.models.user import User, UserStatus
from app.schemas.notification import OrgFallbackRequestOut, PlatformSmtpIn, PlatformSmtpOut, SmtpIn, SmtpOut

logger = logging.getLogger(__name__)

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
    # No default calendar rule (on_date/weekly/monthly) is seeded — those
    # are opt-in, admin-authored schedules, unlike the three above which
    # are tied to a course's own due date and make sense as sane
    # defaults for every org.
]
WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]  # index = Python's date.weekday()


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


CALENDAR_TRIGGERS = ("on_date", "weekly", "monthly")


def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return (date(year + 1, 1, 1) - date(year, 12, 1)).days
    return (date(year, month + 1, 1) - date(year, month, 1)).days


def compute_next_fire(rule: ReminderRule, after: datetime, tz_name: str = "UTC") -> datetime | None:
    """The next UTC instant >= `after` that `rule` is due to fire, or
    None if it's not a calendar-based rule, is missing the field it
    needs (no fire_date on an on_date rule, no days_of_week on a weekly
    one, ...), or its recursion has already ended (past end_date, or a
    one-time on_date rule whose date has passed).

    `after` is "now" when first creating/editing a rule (find the next
    upcoming occurrence), and "last_fired_at + 1 minute" when called
    again right after a fire (find the occurrence strictly after the
    one that just went out) — see fire_rule.

    weekly/monthly's "every N weeks/months" cadence is anchored to the
    rule's own created_at (week/month 0) — day-by-day (weekly) or
    month-by-month (monthly) scan is simplest to get right for every
    interval/day-of-week/day-of-month combination rather than a closed-
    form formula, and this only ever runs on create/update/fire, never
    on a request's hot path, so the cost doesn't matter."""
    try:
        tz = ZoneInfo(tz_name or "UTC")
    except Exception:
        tz = timezone.utc
    hour, _, minute = rule.fire_time.partition(":")
    hour, minute = int(hour or 9), int(minute or 0)
    after_local = after.astimezone(tz)
    interval = max(1, rule.interval)

    if rule.trigger == "on_date":
        if rule.fire_date is None:
            return None
        candidate = datetime(rule.fire_date.year, rule.fire_date.month, rule.fire_date.day, hour, minute, tzinfo=tz)
        return candidate.astimezone(timezone.utc) if candidate >= after_local else None

    if rule.trigger == "weekly":
        if not rule.days_of_week:
            return None
        anchor = rule.created_at.astimezone(tz).date() - timedelta(days=rule.created_at.astimezone(tz).date().weekday())
        for offset in range(0, 366 * 2):  # scan up to 2 years ahead
            candidate_date = after_local.date() + timedelta(days=offset)
            if candidate_date.weekday() not in rule.days_of_week:
                continue
            week_start = candidate_date - timedelta(days=candidate_date.weekday())
            if ((week_start - anchor).days // 7) % interval != 0:
                continue
            if rule.end_date and candidate_date > rule.end_date:
                return None
            candidate = datetime(candidate_date.year, candidate_date.month, candidate_date.day, hour, minute, tzinfo=tz)
            if candidate >= after_local:
                return candidate.astimezone(timezone.utc)
        return None

    if rule.trigger == "monthly":
        if not rule.day_of_month:
            return None
        anchor_ym = rule.created_at.astimezone(tz).date()
        anchor_index = anchor_ym.year * 12 + (anchor_ym.month - 1)
        start_ym = after_local.date()
        start_index = start_ym.year * 12 + (start_ym.month - 1)
        for offset in range(0, 12 * 10):  # scan up to 10 years ahead
            month_index = start_index + offset
            if (month_index - anchor_index) % interval != 0:
                continue
            year, month = divmod(month_index, 12)
            month += 1
            day = min(rule.day_of_month, _days_in_month(year, month))
            candidate_date = date(year, month, day)
            if rule.end_date and candidate_date > rule.end_date:
                return None
            candidate = datetime(year, month, day, hour, minute, tzinfo=tz)
            if candidate >= after_local:
                return candidate.astimezone(timezone.utc)
        return None

    return None


async def recipients_for_rule(db: AsyncSession, rule: ReminderRule) -> list[User]:
    """Who a calendar-based rule's email actually goes to: either every
    active user in the org (target_scope="all" — "sabhi created user"),
    or only the learners enrolled in one specific course (direct +
    team assignment, same resolution course_service.list_enrolled
    uses) when target_scope="course"."""
    if rule.target_scope == "course" and rule.course_id is not None:
        course = await db.get(Course, rule.course_id)
        if course is None or course.org_id != rule.org_id:
            return []
        rows = (await db.execute(
            select(User).where(User.org_id == rule.org_id, User.status == UserStatus.ACTIVE)
        )).scalars().all()
        assigned_users = set(course.assigned_user_ids or [])
        assigned_teams = set(course.assigned_team_ids or [])
        return [u for u in rows if u.id in assigned_users or (u.team_id is not None and u.team_id in assigned_teams)]
    rows = (await db.execute(
        select(User).where(User.org_id == rule.org_id, User.status == UserStatus.ACTIVE)
    )).scalars().all()
    return list(rows)


async def fire_rule(db: AsyncSession, rule: ReminderRule) -> int:
    """Sends rule.subject/rule.message to every current recipient (see
    recipients_for_rule), then advances the rule's own clock: a one-time
    on_date rule is disabled (it only ever fires once); weekly/monthly
    get next_fire_at recomputed to the occurrence strictly after this
    one, or cleared (and the rule disabled) once end_date/the scan
    window is behind it. Every send attempt is still logged via the
    normal EmailLog path (send_email_if_configured), so Sent mail log
    shows these the same as any other transactional mail. Only the
    "email" channel is actually delivered — "inapp"/"push" are recorded
    preferences only, same as for before_due/on_due/overdue; no in-app
    notification inbox exists in this codebase yet for either."""
    sent = 0
    if "email" in (rule.channels or []):
        for user in await recipients_for_rule(db, rule):
            if await send_email_if_configured(db, rule.org_id, user.email, rule.subject, rule.message):
                sent += 1
    now = datetime.now(timezone.utc)
    rule.last_fired_at = now
    if rule.trigger == "on_date":
        rule.next_fire_at = None
        rule.enabled = False
    else:
        org = await db.get(Org, rule.org_id)
        tz_name = org.timezone if org else "UTC"
        next_at = compute_next_fire(rule, now + timedelta(minutes=1), tz_name)
        rule.next_fire_at = next_at
        if next_at is None:
            rule.enabled = False
    await db.commit()
    return sent


async def tick(db: AsyncSession) -> int:
    """Called on a fixed interval by the in-process scheduler (see
    main.py's startup hook) — fires every due calendar-based rule
    across every org in one pass. Deliberately a single global query
    (ReminderRule has no reason to be scoped per-org for this) rather
    than per-org dispatch, since there's no separate worker process in
    this deployment to split the work across."""
    now = datetime.now(timezone.utc)
    due = (await db.execute(
        select(ReminderRule).where(
            ReminderRule.enabled.is_(True), ReminderRule.trigger.in_(CALENDAR_TRIGGERS),
            ReminderRule.next_fire_at.is_not(None), ReminderRule.next_fire_at <= now,
        )
    )).scalars().all()
    fired = 0
    for rule in due:
        try:
            await fire_rule(db, rule)
            fired += 1
        except Exception:
            logger.exception("Reminder rule %s failed to fire", rule.id)
    return fired


async def recompute_next_fire(db: AsyncSession, rule: ReminderRule) -> None:
    """Called right after a calendar-based rule is created/edited/
    enabled — (re)derives next_fire_at from scratch (as of now), so a
    freshly-saved rule's schedule reflects whatever was just changed
    instead of whatever an earlier save had computed."""
    if rule.trigger not in CALENDAR_TRIGGERS:
        rule.next_fire_at = None
        return
    if not rule.enabled:
        rule.next_fire_at = None
        return
    org = await db.get(Org, rule.org_id)
    tz_name = org.timezone if org else "UTC"
    rule.next_fire_at = compute_next_fire(rule, datetime.now(timezone.utc), tz_name)


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


def _connect(row, encryption: str) -> smtplib.SMTP:
    """Just the connection/handshake — no login, no send. Kept separate
    from _send_blocking so the SSL<->STARTTLS protocol-mismatch retry only
    ever re-does the handshake, never a login that's already in flight
    (see _send_blocking's comment on why that distinction matters)."""
    ctx = ssl.create_default_context()
    if encryption == "SSL":
        return smtplib.SMTP_SSL(row.host, row.port, timeout=10, context=ctx)
    server = smtplib.SMTP(row.host, row.port, timeout=10)
    if encryption == "TLS":
        server.starttls(context=ctx)
    return server


def _send_blocking(
    row, to_addr: str, subject: str, body: str,
    attachment: tuple[str, str, bytes] | None = None,
) -> None:
    """attachment, when given, is (filename, mime_type e.g. "application/pdf",
    raw bytes) — used by the invoice-email path below. Every other caller
    passes None and gets the original plain-text-only behaviour."""
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = f"{row.from_name} <{row.from_email}>" if row.from_name else row.from_email
    msg["To"] = to_addr
    msg.set_content(body)
    if attachment is not None:
        filename, mime_type, data = attachment
        maintype, _, subtype = mime_type.partition("/")
        msg.add_attachment(data, maintype=maintype, subtype=subtype or "octet-stream", filename=filename)

    try:
        server = _connect(row, row.encryption)
    except smtplib.SMTPServerDisconnected:
        # Very common misconfiguration: a provider's port only speaks
        # implicit SSL (e.g. 465) while the saved setting is TLS/STARTTLS
        # (or vice versa — some providers' "587" is implicit-SSL-only).
        # The server slams the connection shut immediately on the wrong
        # handshake, which is exactly this exception. The port number is a
        # much more reliable signal than the saved dropdown, so retry once
        # with the other protocol before giving up.
        fallback = "SSL" if row.encryption != "SSL" else "TLS"
        server = _connect(row, fallback)

    with server:
        if row.username:
            try:
                server.login(row.username, row.password)
            except smtplib.SMTPServerDisconnected as exc:
                # Not a protocol mismatch — the connection was already
                # live. Some providers (Gmail in particular) silently
                # drop the connection the moment they reject one AUTH
                # attempt, rather than replying with a clean error;
                # smtplib's own PLAIN→LOGIN fallback then tries the next
                # mechanism on that now-dead socket and raises this
                # generic disconnection, burying the real "bad
                # credentials" reason. Surface it as what it almost
                # always actually is, instead of retrying the protocol
                # (which would just reproduce the same confusing error).
                raise RuntimeError(
                    "Login rejected and the connection was closed - double-check the username/password "
                    "(Gmail and several other providers need an App Password with 2-Step Verification on, "
                    "not the account's normal login password)"
                ) from exc
        server.send_message(msg)


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
        return False, f"Couldn't connect — check host and credentials. ({type(exc).__name__}: {exc})"


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


async def send_email_with_attachment_if_configured(
    db: AsyncSession, org_id: uuid.UUID, to_addr: str, subject: str, body: str,
    attachment_filename: str, attachment_bytes: bytes, attachment_mimetype: str = "application/pdf",
) -> bool:
    """Same best-effort/3-tier resolution as send_email_if_configured
    (see that docstring) — only difference is the message carries one
    file attachment. Used for emailing a payment's invoice PDF the
    moment it's confirmed (billing.py's _activate_from_payment)."""
    row, source, why = await resolve_send_source(db, org_id)
    if row is None:
        await log_email(db, org_id, to_addr, subject, "none", "skipped", why)
        return False
    try:
        await asyncio.to_thread(
            _send_blocking, row, to_addr, subject, body, (attachment_filename, attachment_mimetype, attachment_bytes)
        )
    except Exception as exc:
        await log_email(db, org_id, to_addr, subject, source, "failed", f"{type(exc).__name__}: {exc}")
        return True
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

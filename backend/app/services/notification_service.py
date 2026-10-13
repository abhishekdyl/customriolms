import asyncio
import smtplib
import ssl
import uuid
from email.message import EmailMessage

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.notification import NotificationTemplate, OrgSmtpSettings, ReminderRule
from app.schemas.notification import SmtpIn, SmtpOut

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


def _send_blocking(row: OrgSmtpSettings, to_addr: str) -> None:
    msg = EmailMessage()
    msg["Subject"] = "Riosmart LMS — SMTP test"
    msg["From"] = f"{row.from_name} <{row.from_email}>" if row.from_name else row.from_email
    msg["To"] = to_addr
    msg.set_content("This is a test email confirming your organization's SMTP settings work.")
    ctx = ssl.create_default_context()
    if row.encryption == "SSL":
        server = smtplib.SMTP_SSL(row.host, row.port, timeout=10, context=ctx)
    else:
        server = smtplib.SMTP(row.host, row.port, timeout=10)
    with server:
        if row.encryption == "TLS":
            server.starttls(context=ctx)
        if row.username:
            server.login(row.username, row.password)
        server.send_message(msg)


async def send_test_email(row: OrgSmtpSettings, to_addr: str) -> tuple[bool, str]:
    if not row.host or not row.from_email:
        return False, "Couldn't connect — check host and credentials."
    try:
        await asyncio.to_thread(_send_blocking, row, to_addr)
        return True, f"Test email sent successfully to {to_addr}."
    except Exception as exc:  # surface any connect/auth failure as a clean message
        return False, f"Couldn't connect — check host and credentials. ({type(exc).__name__})"

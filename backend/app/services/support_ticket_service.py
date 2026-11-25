"""Org Admin <-> Super Admin support tickets — see
models/support_ticket.py for the full design note. Email notifications
are best-effort (mirrors whatsapp_service.send_certificate_notification's
own reasoning): a failed notify should never break the ticket action
itself, so every send is wrapped and swallowed, never raised.
"""
import logging
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.org import Org
from app.models.support_ticket import SupportTicket, SupportTicketMessage
from app.models.user import RoleName, User
from app.schemas.support_ticket import (
    SupportTicketIn, SupportTicketMessageOut, SupportTicketOut,
)
from app.services import notification_service

logger = logging.getLogger(__name__)


def can_raise(user: User) -> bool:
    """Only a real Org Admin may open a ticket — deliberately narrower
    than the `org_settings.manage` capability a custom role could hold,
    and Team Lead is never included either. This is the user's own
    explicit call, not derived from the capability system."""
    return user.role == RoleName.ORG_ADMIN


def is_super_admin(user: User) -> bool:
    return user.role == RoleName.SUPER_ADMIN


def can_view(ticket: SupportTicket, user: User) -> bool:
    if is_super_admin(user):
        return True
    return user.role == RoleName.ORG_ADMIN and user.org_id == ticket.org_id


async def _message_counts(db: AsyncSession, ticket_ids: list[uuid.UUID]) -> dict[uuid.UUID, int]:
    if not ticket_ids:
        return {}
    rows = (await db.execute(
        select(SupportTicketMessage.ticket_id, func.count())
        .where(SupportTicketMessage.ticket_id.in_(ticket_ids))
        .group_by(SupportTicketMessage.ticket_id)
    )).all()
    return dict(rows)


async def _to_out(db: AsyncSession, ticket: SupportTicket, org: Org, message_count: int) -> SupportTicketOut:
    raiser = await db.get(User, ticket.raised_by_user_id) if ticket.raised_by_user_id else None
    return SupportTicketOut(
        id=ticket.id, subject=ticket.subject, category=ticket.category, priority=ticket.priority, status=ticket.status,
        raised_by_name=f"{raiser.firstname} {raiser.lastname}".strip() if raiser else None,
        message_count=message_count,
        org_id=org.id, org_name=org.name, org_slug=org.slug,
        created_at=ticket.created_at, updated_at=ticket.updated_at,
    )


async def list_for_org(db: AsyncSession, org_id: uuid.UUID) -> list[SupportTicketOut]:
    org = await db.get(Org, org_id)
    rows = (await db.execute(
        select(SupportTicket).where(SupportTicket.org_id == org_id).order_by(SupportTicket.updated_at.desc())
    )).scalars().all()
    counts = await _message_counts(db, [r.id for r in rows])
    return [await _to_out(db, r, org, counts.get(r.id, 0)) for r in rows]


async def list_all(
    db: AsyncSession, *, status: str | None = None, category: str | None = None, priority: str | None = None, org_id: uuid.UUID | None = None,
) -> list[SupportTicketOut]:
    """The Super Admin's cross-org queue — every org's tickets in one
    list, newest-updated first, optionally filtered."""
    stmt = select(SupportTicket, Org).join(Org, Org.id == SupportTicket.org_id)
    if status:
        stmt = stmt.where(SupportTicket.status == status)
    if category:
        stmt = stmt.where(SupportTicket.category == category)
    if priority:
        stmt = stmt.where(SupportTicket.priority == priority)
    if org_id:
        stmt = stmt.where(SupportTicket.org_id == org_id)
    stmt = stmt.order_by(SupportTicket.updated_at.desc())
    rows = (await db.execute(stmt)).all()
    counts = await _message_counts(db, [t.id for t, _ in rows])
    return [await _to_out(db, t, org, counts.get(t.id, 0)) for t, org in rows]


async def get_ticket_or_404(db: AsyncSession, ticket_id: uuid.UUID) -> SupportTicket:
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


async def _super_admin_emails(db: AsyncSession) -> list[User]:
    return (await db.execute(select(User).where(User.role == RoleName.SUPER_ADMIN))).scalars().all()


async def _org_admin_emails(db: AsyncSession, org_id: uuid.UUID) -> list[User]:
    return (await db.execute(select(User).where(User.role == RoleName.ORG_ADMIN, User.org_id == org_id))).scalars().all()


async def _notify_best_effort(db: AsyncSession, recipients: list[User], subject: str, body: str) -> None:
    for u in recipients:
        try:
            await notification_service.send_email_if_configured(db, u.org_id, u.email, subject, body)
        except Exception:
            logger.exception("support ticket notification failed for %s", u.email)


async def create_ticket(db: AsyncSession, user: User, body: SupportTicketIn) -> SupportTicketOut:
    ticket = SupportTicket(org_id=user.org_id, raised_by_user_id=user.id, subject=body.subject.strip(), category=body.category, priority=body.priority)
    db.add(ticket)
    await db.flush()
    db.add(SupportTicketMessage(ticket_id=ticket.id, author_user_id=user.id, body=body.body.strip()))
    await db.commit()
    await db.refresh(ticket)

    org = await db.get(Org, user.org_id)
    await _notify_best_effort(
        db, await _super_admin_emails(db), f"New support ticket: {ticket.subject}",
        f"{user.firstname} {user.lastname} ({org.name if org else 'an org'}) opened a new {ticket.priority} priority {ticket.category} ticket: \"{ticket.subject}\".\n\n{body.body.strip()}",
    )
    return await _to_out(db, ticket, org, 1)


async def list_messages(db: AsyncSession, ticket_id: uuid.UUID) -> list[SupportTicketMessageOut]:
    rows = (await db.execute(
        select(SupportTicketMessage).where(SupportTicketMessage.ticket_id == ticket_id).order_by(SupportTicketMessage.created_at.asc())
    )).scalars().all()
    author_ids = {r.author_user_id for r in rows if r.author_user_id is not None}
    authors: dict[uuid.UUID, User] = {}
    if author_ids:
        users = (await db.execute(select(User).where(User.id.in_(author_ids)))).scalars().all()
        authors = {u.id: u for u in users}
    out = []
    for r in rows:
        author = authors.get(r.author_user_id) if r.author_user_id else None
        out.append(SupportTicketMessageOut(
            id=r.id, body=r.body,
            author_name=f"{author.firstname} {author.lastname}".strip() if author else None,
            is_super_admin=author.role == RoleName.SUPER_ADMIN if author else False,
            created_at=r.created_at,
        ))
    return out


async def add_message(db: AsyncSession, ticket: SupportTicket, user: User, body: str) -> SupportTicketMessageOut:
    row = SupportTicketMessage(ticket_id=ticket.id, author_user_id=user.id, body=body.strip())
    db.add(row)
    # A resolved ticket reopens itself the moment the org side replies
    # again — no separate "reopen" action for an Org Admin to find (see
    # the model's docstring). A Super Admin replying to an open ticket
    # doesn't change its status either way; they resolve it explicitly.
    reopened = False
    if ticket.status == "resolved" and not is_super_admin(user):
        ticket.status = "open"
        reopened = True
    await db.commit()
    await db.refresh(row)

    org = await db.get(Org, ticket.org_id)
    if is_super_admin(user):
        recipients = await _org_admin_emails(db, ticket.org_id)
        notice = f"The support team replied to your ticket \"{ticket.subject}\":\n\n{body.strip()}"
    else:
        recipients = await _super_admin_emails(db)
        reopen_note = " (this reopens it)" if reopened else ""
        notice = f"{user.firstname} {user.lastname} ({org.name if org else 'an org'}) replied to ticket \"{ticket.subject}\"{reopen_note}:\n\n{body.strip()}"
    await _notify_best_effort(db, recipients, f"Re: {ticket.subject}", notice)

    return SupportTicketMessageOut(
        id=row.id, body=row.body, author_name=f"{user.firstname} {user.lastname}".strip(),
        is_super_admin=is_super_admin(user), created_at=row.created_at,
    )


async def set_status(db: AsyncSession, ticket: SupportTicket, status: str) -> SupportTicket:
    ticket.status = status
    await db.commit()
    await db.refresh(ticket)
    return ticket


async def ticket_out(db: AsyncSession, ticket: SupportTicket) -> SupportTicketOut:
    org = await db.get(Org, ticket.org_id)
    counts = await _message_counts(db, [ticket.id])
    return await _to_out(db, ticket, org, counts.get(ticket.id, 0))

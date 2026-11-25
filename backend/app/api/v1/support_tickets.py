import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.support_ticket import (
    SupportTicketIn, SupportTicketMessageIn, SupportTicketMessageOut, SupportTicketOut, SupportTicketStatusUpdate,
)
from app.services import support_ticket_service as svc

router = APIRouter(prefix="/api/v1/support-tickets", tags=["support-tickets"])

# A small two-party helpdesk between an org's own Org Admin(s) and the
# platform's Super Admin team — see support_ticket_service's module
# docstring and models/support_ticket.py for the full design note.
# There's no `require_capability` gate here: who may raise/view a
# ticket is a fixed role rule (can_raise/can_view), not something a
# custom role can be granted, by the user's own explicit call.


@router.get("", response_model=list[SupportTicketOut])
async def list_support_tickets(
    status: str | None = Query(default=None),
    category: str | None = Query(default=None),
    priority: str | None = Query(default=None),
    org_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """A Super Admin gets every org's tickets (optionally filtered); an
    Org Admin gets only their own org's (org_id/status/category/priority
    query params are ignored for them — their list is always "everything
    for my org", same as every other org-scoped list in this app)."""
    if svc.is_super_admin(current_user):
        return await svc.list_all(db, status=status, category=category, priority=priority, org_id=org_id)
    if not svc.can_raise(current_user):
        raise HTTPException(status_code=403, detail="Only an Org Admin can view this org's support tickets")
    return await svc.list_for_org(db, current_user.org_id)


@router.post("", response_model=SupportTicketOut, status_code=201)
async def create_support_ticket(body: SupportTicketIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if not svc.can_raise(current_user):
        raise HTTPException(status_code=403, detail="Only an Org Admin can open a support ticket")
    return await svc.create_ticket(db, current_user, body)


async def _get_visible_ticket(db: AsyncSession, ticket_id: uuid.UUID, user: User):
    ticket = await svc.get_ticket_or_404(db, ticket_id)
    if not svc.can_view(ticket, user):
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket


@router.get("/{ticket_id}/messages", response_model=list[SupportTicketMessageOut])
async def list_support_ticket_messages(ticket_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await _get_visible_ticket(db, ticket_id, current_user)
    return await svc.list_messages(db, ticket_id)


@router.post("/{ticket_id}/messages", response_model=SupportTicketMessageOut, status_code=201)
async def reply_support_ticket(
    ticket_id: uuid.UUID, body: SupportTicketMessageIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    ticket = await _get_visible_ticket(db, ticket_id, current_user)
    return await svc.add_message(db, ticket, current_user, body.body)


@router.patch("/{ticket_id}/status", response_model=SupportTicketOut)
async def update_support_ticket_status(
    ticket_id: uuid.UUID, body: SupportTicketStatusUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Either side can set status — a Super Admin marking it resolved,
    or the Org Admin themselves closing it out once they're satisfied.
    (A reply from the Org Admin side still auto-reopens it regardless —
    see add_message — so this is just the explicit action, not the
    only way status ever changes.)"""
    ticket = await _get_visible_ticket(db, ticket_id, current_user)
    await svc.set_status(db, ticket, body.status)
    return await svc.ticket_out(db, ticket)

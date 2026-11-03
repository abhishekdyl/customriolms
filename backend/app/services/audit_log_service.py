import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.audit_log import AuditLog
from app.models.user import User


async def record(
    db: AsyncSession, *, org_id: uuid.UUID, actor: User, action: str, entity_type: str,
    entity_id: uuid.UUID | None = None, entity_label: str = "", detail: str = "",
) -> None:
    """Writes one audit-trail row. Call this AFTER the action's own
    db.commit() has already succeeded — an audit entry for something that
    didn't actually happen (because the real write rolled back) would be
    worse than no entry at all. Commits on its own, same as
    notification_service.log_email, so a logging failure never unwinds
    the action it's describing.

    actor_name/entity_label are snapshotted here, not read back from a
    live join later — see AuditLog's docstring for why."""
    db.add(AuditLog(
        org_id=org_id, actor_id=actor.id, actor_name=actor.full_name,
        action=action, entity_type=entity_type, entity_id=entity_id,
        entity_label=entity_label[:300], detail=detail,
    ))
    await db.commit()


async def list_audit_log(
    db: AsyncSession, org_id: uuid.UUID, limit: int = 100, action_prefix: str | None = None,
) -> list[AuditLog]:
    """Newest first — the "kisne kya badla, kab" view (Audit log tab).
    action_prefix (e.g. "course.") narrows to one action family without
    the caller needing to know every exact action string."""
    stmt = select(AuditLog).where(AuditLog.org_id == org_id)
    if action_prefix:
        stmt = stmt.where(AuditLog.action.like(f"{action_prefix}%"))
    rows = (await db.execute(stmt.order_by(AuditLog.created_at.desc()).limit(limit))).scalars().all()
    return list(rows)

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_capability
from app.core.database import get_db
from app.models.user import User
from app.schemas.audit_log import AuditLogOut
from app.services import audit_log_service

router = APIRouter(
    prefix="/api/v1/audit-log", tags=["audit-log"],
    dependencies=[Depends(require_capability("audit_log.view"))],
)


@router.get("", response_model=list[AuditLogOut])
async def get_audit_log(
    action: str | None = Query(default=None, description='Narrow to one action family, e.g. "course" or "user"'),
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    """"Kisne kya badla, kab" — who changed a course, graded an attempt, or
    edited a user's role, newest first. Org Admin only, scoped to this org."""
    prefix = f"{action}." if action else None
    return await audit_log_service.list_audit_log(db, user.org_id, action_prefix=prefix)

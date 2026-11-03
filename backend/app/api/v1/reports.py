from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import RoleName, User
from app.schemas.report import ReportsOut
from app.services import report_service

router = APIRouter(
    prefix="/api/v1/reports", tags=["reports"],
    dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))],
)


@router.get("", response_model=ReportsOut)
async def get_reports(
    days: int = Query(default=14, ge=1, le=90, description="How many trailing days the activity trend covers"),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """The Reports & Analytics page in one call — org-wide (or, for a Team
    Lead, team-scoped) overview numbers, a per-course performance table,
    and a short activity trend. Same scoping rule as the Gradebook and
    Module Progress views: a Team Lead sees only their own team."""
    return await report_service.build_reports(db, current_user, days=days)

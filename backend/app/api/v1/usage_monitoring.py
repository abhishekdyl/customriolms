import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_role
from app.core.database import get_db
from app.models.user import RoleName
from app.schemas.usage_monitoring import OrgUsageDetailOut, OrgUsageOut, ServerHealthOut
from app.services import server_health_service, usage_monitoring_service

router = APIRouter(prefix="/api/v1/usage-monitoring", tags=["usage-monitoring"])
super_admin_only = [Depends(require_role(RoleName.SUPER_ADMIN))]


@router.get("/server-health", response_model=ServerHealthOut, dependencies=super_admin_only)
async def get_server_health():
    """Live CPU/RAM/disk snapshot of the host this process runs on — not
    per-org (see server_health_service's docstring)."""
    return server_health_service.snapshot()


@router.get("/orgs", response_model=list[OrgUsageOut], dependencies=super_admin_only)
async def list_org_usage(db: AsyncSession = Depends(get_db)):
    """The main table: every org's storage/user/request/activity numbers
    for today, one row each."""
    return await usage_monitoring_service.list_org_usage(db)


@router.get("/orgs/{org_id}", response_model=OrgUsageDetailOut, dependencies=super_admin_only)
async def get_org_usage_detail(
    org_id: uuid.UUID, days: int = Query(default=7, ge=1, le=90), db: AsyncSession = Depends(get_db),
):
    """The drill-down behind clicking an org row — storage breakdown by
    type plus request-load and active-user trends over the chosen
    window (7/30/90 days)."""
    return await usage_monitoring_service.org_usage_detail(db, org_id, days)

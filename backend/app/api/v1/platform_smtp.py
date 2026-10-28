import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import RoleName, User
from app.schemas.notification import (
    OrgFallbackRequestOut, PlatformSmtpIn, PlatformSmtpOut, SmtpTestResult,
)
from app.services import notification_service as svc

router = APIRouter(
    prefix="/api/v1/platform/smtp", tags=["platform-smtp"],
    dependencies=[Depends(require_role(RoleName.SUPER_ADMIN))],
)


@router.get("", response_model=PlatformSmtpOut)
async def get_platform_smtp(db: AsyncSession = Depends(get_db)):
    return svc.platform_smtp_out(await svc.get_platform_smtp(db))


@router.patch("", response_model=PlatformSmtpOut)
async def save_platform_smtp(body: PlatformSmtpIn, db: AsyncSession = Depends(get_db)):
    return svc.platform_smtp_out(await svc.save_platform_smtp(db, body))


@router.post("/test", response_model=SmtpTestResult)
async def test_platform_smtp(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """Sends to the Super Admin's own address — there's no "current org"
    to send a platform-level test to."""
    ok, detail = await svc.send_test_email(await svc.get_platform_smtp(db), user.email)
    return SmtpTestResult(ok=ok, detail=detail)


@router.get("/requests", response_model=list[OrgFallbackRequestOut])
async def list_requests(db: AsyncSession = Depends(get_db)):
    """Every org that has ever requested, been approved for, or been
    denied platform-SMTP fallback — newest request first."""
    return await svc.list_fallback_requests(db)


@router.post("/requests/{org_id}/approve", response_model=OrgFallbackRequestOut)
async def approve_request(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    row = await svc.decide_fallback_request(db, org_id, approve=True)
    return next(r for r in await svc.list_fallback_requests(db) if r.org_id == row.org_id)


@router.post("/requests/{org_id}/deny", response_model=OrgFallbackRequestOut)
async def deny_request(org_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    row = await svc.decide_fallback_request(db, org_id, approve=False)
    return next(r for r in await svc.list_fallback_requests(db) if r.org_id == row.org_id)

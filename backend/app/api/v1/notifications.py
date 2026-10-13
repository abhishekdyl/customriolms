import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.notification import NotificationTemplate, ReminderRule
from app.models.user import RoleName, User
from app.schemas.notification import (
    RuleIn, RuleOut, SmtpIn, SmtpOut, SmtpTestResult, TemplateIn, TemplateOut,
)
from app.services import notification_service as svc

router = APIRouter(
    prefix="/api/v1/notifications", tags=["notifications"],
    dependencies=[Depends(require_role(RoleName.ORG_ADMIN))],
)


# ---------- Templates ----------
@router.get("/templates", response_model=list[TemplateOut])
async def list_templates(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await svc.list_templates(db, user.org_id)


@router.post("/templates", response_model=TemplateOut, status_code=201)
async def create_template(body: TemplateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    t = NotificationTemplate(org_id=user.org_id, **body.model_dump())
    db.add(t)
    await db.commit()
    await db.refresh(t)
    return t


@router.patch("/templates/{template_id}", response_model=TemplateOut)
async def update_template(template_id: uuid.UUID, body: TemplateIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    t = await svc.get_owned(db, NotificationTemplate, template_id, user.org_id)
    for k, v in body.model_dump().items():
        setattr(t, k, v)
    await db.commit()
    await db.refresh(t)
    return t


@router.delete("/templates/{template_id}", status_code=204)
async def delete_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    t = await svc.get_owned(db, NotificationTemplate, template_id, user.org_id)
    if not t.editable:
        raise HTTPException(status_code=400, detail="System templates can't be deleted")
    await db.delete(t)
    await db.commit()


# ---------- Reminder rules ----------
@router.get("/rules", response_model=list[RuleOut])
async def list_rules(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await svc.list_rules(db, user.org_id)


@router.post("/rules", response_model=RuleOut, status_code=201)
async def create_rule(body: RuleIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    r = ReminderRule(org_id=user.org_id, **body.model_dump())
    db.add(r)
    await db.commit()
    await db.refresh(r)
    return r


@router.patch("/rules/{rule_id}", response_model=RuleOut)
async def update_rule(rule_id: uuid.UUID, body: RuleIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    r = await svc.get_owned(db, ReminderRule, rule_id, user.org_id)
    for k, v in body.model_dump().items():
        setattr(r, k, v)
    await db.commit()
    await db.refresh(r)
    return r


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    r = await svc.get_owned(db, ReminderRule, rule_id, user.org_id)
    await db.delete(r)
    await db.commit()


# ---------- SMTP ----------
@router.get("/smtp", response_model=SmtpOut)
async def get_smtp(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.smtp_out(await svc.get_smtp(db, user.org_id))


@router.patch("/smtp", response_model=SmtpOut)
async def save_smtp(body: SmtpIn, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return svc.smtp_out(await svc.save_smtp(db, user.org_id, body))


@router.post("/smtp/test", response_model=SmtpTestResult)
async def test_smtp(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    ok, detail = await svc.send_test_email(await svc.get_smtp(db, user.org_id), user.email)
    return SmtpTestResult(ok=ok, detail=detail)

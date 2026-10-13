import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.certificate import CertTemplate
from app.models.user import RoleName, User
from app.schemas.certificate import (
    CertificateIssueRequest, CertificateOut, CertTemplateCreate, CertTemplateOut, CertTemplateUpdate,
)
from app.services.certificate_service import (
    get_certificate_or_404, get_certificate_public, get_template_or_404,
    issue_certificate, list_certificates,
)

router = APIRouter(prefix="/api/v1/certificates", tags=["certificates"])


# ---------- Templates ----------
@router.get("/templates", response_model=list[CertTemplateOut], dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def list_templates(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    result = await db.execute(select(CertTemplate).where(CertTemplate.org_id == current_user.org_id))
    return result.scalars().all()


@router.post("/templates", response_model=CertTemplateOut, status_code=201, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def create_template(body: CertTemplateCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    template = CertTemplate(org_id=current_user.org_id, **body.model_dump())
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


@router.patch("/templates/{template_id}", response_model=CertTemplateOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def update_template(template_id: uuid.UUID, body: CertTemplateUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    template = await get_template_or_404(db, template_id, current_user.org_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(template, key, value)
    await db.commit()
    await db.refresh(template)
    return template


@router.delete("/templates/{template_id}", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def delete_template(template_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    template = await get_template_or_404(db, template_id, current_user.org_id)
    # Certificates already issued keep their template_id (FK is nullable, ON DELETE
    # isn't CASCADE) — deleting a design doesn't retroactively break past certificates.
    await db.delete(template)
    await db.commit()


# ---------- Issued certificates ----------
@router.get("", response_model=list[CertificateOut], dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def list_issued(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await list_certificates(db, current_user.org_id)


@router.post("", response_model=CertificateOut, status_code=201, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def issue(body: CertificateIssueRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await issue_certificate(db, current_user.org_id, body.user_id, body.course_id, body.template_id)


@router.delete("/{cert_id}", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def revoke(cert_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    cert = await get_certificate_or_404(db, cert_id, current_user.org_id)
    await db.delete(cert)
    await db.commit()


# ---------- Public verification — no auth, backs the share page + QR code ----------
@router.get("/verify/{code}", response_model=CertificateOut)
async def verify(code: str, db: AsyncSession = Depends(get_db)):
    return await get_certificate_public(db, code)

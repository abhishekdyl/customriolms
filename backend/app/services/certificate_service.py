import secrets
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.certificate import Certificate, CertTemplate
from app.models.course import Course
from app.models.user import User

DEFAULT_TEMPLATE_FIELDS = {
    "learnerName": True, "courseTitle": True, "date": True,
    "duration": True, "issuerName": True, "verificationCode": True, "qrCode": True,
}
DEFAULT_FIELD_POSITIONS = {
    "learnerName": {"x": 50, "y": 40}, "courseTitle": {"x": 50, "y": 58},
    "date": {"x": 30, "y": 78}, "duration": {"x": 50, "y": 78},
    "issuerName": {"x": 70, "y": 78}, "verificationCode": {"x": 50, "y": 92},
    "qrCode": {"x": 88, "y": 88},
}


async def get_template_or_404(db: AsyncSession, template_id: uuid.UUID, org_id: uuid.UUID) -> CertTemplate:
    result = await db.execute(select(CertTemplate).where(CertTemplate.id == template_id, CertTemplate.org_id == org_id))
    template = result.scalar_one_or_none()
    if template is None:
        raise HTTPException(status_code=404, detail="Certificate template not found")
    return template


async def ensure_org_has_a_template(db: AsyncSession, org_id: uuid.UUID) -> CertTemplate:
    """Every org needs at least one template to issue against — called on first
    certificate issuance if none exist yet, mirroring the frontend's own seed default."""
    result = await db.execute(select(CertTemplate).where(CertTemplate.org_id == org_id).limit(1))
    existing = result.scalar_one_or_none()
    if existing:
        return existing
    template = CertTemplate(
        org_id=org_id, name="Default", fields=DEFAULT_TEMPLATE_FIELDS, field_positions=DEFAULT_FIELD_POSITIONS,
    )
    db.add(template)
    await db.commit()
    await db.refresh(template)
    return template


def _generate_code(course_title: str, learner_name: str) -> str:
    prefix = "".join(w[0] for w in course_title.split()[:3]).upper() or "CERT"
    initials = "".join(w[0] for w in learner_name.split()[:2]).upper() or "XX"
    return f"{prefix}-{secrets.randbelow(9000) + 1000}-{initials}"


async def issue_certificate(db: AsyncSession, org_id: uuid.UUID, user_id: uuid.UUID, course_id: uuid.UUID, template_id: uuid.UUID | None) -> Certificate:
    user_result = await db.execute(select(User).where(User.id == user_id, User.org_id == org_id))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found in this organization")

    course_result = await db.execute(select(Course).where(Course.id == course_id, Course.org_id == org_id))
    course = course_result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found in this organization")

    if template_id:
        await get_template_or_404(db, template_id, org_id)  # 404s if it doesn't belong to this org
    else:
        template_id = (await ensure_org_has_a_template(db, org_id)).id

    cert = Certificate(
        org_id=org_id, user_id=user_id, course_id=course_id, template_id=template_id,
        code=_generate_code(course.title, user.name),
    )
    db.add(cert)
    await db.commit()
    await db.refresh(cert)
    return cert


async def list_certificates(db: AsyncSession, org_id: uuid.UUID) -> list[dict]:
    result = await db.execute(
        select(Certificate, User.name.label("learner_name"), Course.title.label("course_title"))
        .join(User, Certificate.user_id == User.id)
        .join(Course, Certificate.course_id == Course.id)
        .where(Certificate.org_id == org_id)
    )
    return [
        {**cert.__dict__, "learner_name": learner_name, "course_title": course_title}
        for cert, learner_name, course_title in result.all()
    ]


async def get_certificate_or_404(db: AsyncSession, cert_id: uuid.UUID, org_id: uuid.UUID) -> Certificate:
    result = await db.execute(select(Certificate).where(Certificate.id == cert_id, Certificate.org_id == org_id))
    cert = result.scalar_one_or_none()
    if cert is None:
        raise HTTPException(status_code=404, detail="Certificate not found")
    return cert


async def get_certificate_public(db: AsyncSession, code: str) -> dict:
    """No org scoping — this backs the public verification page, reachable by
    anyone with the link or QR code, same as the frontend's CertificateSharePage."""
    result = await db.execute(
        select(Certificate, User.name.label("learner_name"), Course.title.label("course_title"))
        .join(User, Certificate.user_id == User.id)
        .join(Course, Certificate.course_id == Course.id)
        .where(Certificate.code == code)
    )
    row = result.first()
    if row is None:
        raise HTTPException(status_code=404, detail="No certificate found for this code")
    cert, learner_name, course_title = row
    return {**cert.__dict__, "learner_name": learner_name, "course_title": course_title}

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.certificate import Certificate, CertTemplate
from app.models.org import Org
from app.models.course import Course
from app.models.team import Team
from app.models.user import RoleName, User, split_full_name
from app.schemas.learn import (
    CertDetail, CompleteRequest, CompleteResult, LearnCourseDetail, LearnCourseItem, LearnModule, LearnNotification,
    LearnProgress, LearnSummary, LeaderRow, ProfileOut, ProfileUpdate, QuizResult, QuizSubmit,
)
from app.schemas.question import QuestionLearnerOut
from app.services import learn_service as svc
from app.services.certificate_service import ensure_org_has_a_template

# The whole learner app lives behind this one dependency: only LEARNER (and platform
# SUPER_ADMIN, via require_role) can call it, and every query is scoped to the caller.
router = APIRouter(
    prefix="/api/v1/learn", tags=["learn"],
    dependencies=[Depends(require_role(RoleName.LEARNER))],
)


@router.get("/summary", response_model=LearnSummary)
async def summary(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await svc.touch_activity(db, user.id)
    courses = await svc.assigned_courses(db, user)
    done = await svc.completed_map(db, user.id)
    pcts = [(c, svc.course_progress(c, done)[0]) for c in courses]
    in_progress = [c for c, p in pcts if 0 < p < 100]
    not_done = [c for c, p in pcts if p < 100]
    nxt = (in_progress or not_done or [None])[0]
    week = await svc.trained_week(db, user.id)
    # "unread" = a certificate earned in the last 7 days (there is no read-state table yet)
    since = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=7)
    has_unread = (await db.execute(
        select(Certificate.id).where(Certificate.user_id == user.id, Certificate.issued_at >= since).limit(1)
    )).first() is not None
    return LearnSummary(
        name=user.full_name, streak=await svc.streak_for(db, user.id), week=week, days_trained=sum(week),
        assigned_count=len(courses), in_progress_count=len(in_progress), completed_count=sum(1 for _, p in pcts if p >= 100),
        next_course_id=nxt.id if nxt else None, next_course_title=nxt.title if nxt else None,
        next_course_modules=len(nxt.modules) if nxt else 0, has_unread=has_unread,
    )


@router.get("/courses", response_model=list[LearnCourseItem])
async def my_courses(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    courses = await svc.assigned_courses(db, user)
    done = await svc.completed_map(db, user.id)
    out = []
    for i, c in enumerate(courses):
        pct, n, total = svc.course_progress(c, done)
        out.append(LearnCourseItem(
            id=c.id, title=c.title, category_name=c.category.name if c.category else None, duration_label=c.duration_label,
            module_count=len(c.modules), completed_modules=n, progress=pct, status=svc.status_for(pct), cover_index=i,
        ))
    return out


@router.get("/courses/{course_id}", response_model=LearnCourseDetail)
async def course_detail(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    course: Course = await svc.assigned_course_or_404(db, user, course_id)
    done = await svc.completed_map(db, user.id)
    pct, _, _ = svc.course_progress(course, done)
    mods = []
    for m in course.modules:
        mp = done.get(m.id)
        mods.append(LearnModule(
            id=m.id, title=m.title, type=m.type.value, required=m.required, threshold=m.threshold,
            completed=mp is not None, score=mp.score if mp else None, skill_count=len(m.skill_ids or []),
            file_name=m.file_name, instructions=m.instructions,
            questions=[QuestionLearnerOut.model_validate(q) for q in m.questions],
        ))
    return LearnCourseDetail(
        id=course.id, title=course.title, description=course.description,
        category_name=course.category.name if course.category else None, duration_label=course.duration_label,
        progress=pct, status=svc.status_for(pct), modules=mods,
    )


@router.post("/modules/{module_id}/complete", response_model=CompleteResult)
async def complete(
    module_id: uuid.UUID, body: CompleteRequest | None = None,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    pct, completed, code, video_question_results = await svc.complete_module(
        db, user, module_id, (body.watched_pct if body else None), (body.answers if body else None),
    )
    return CompleteResult(progress=pct, course_completed=completed, certificate_code=code,
                           video_question_results=video_question_results)


@router.post("/modules/{module_id}/quiz", response_model=QuizResult)
async def quiz(module_id: uuid.UUID, body: QuizSubmit, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await svc.submit_quiz(db, user, module_id, body.answers)


@router.get("/progress", response_model=LearnProgress)
async def progress(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await svc.build_progress(db, user)


@router.get("/leaderboard", response_model=list[LeaderRow])
async def leaderboard(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await svc.leaderboard(db, user)


async def _profile(db: AsyncSession, user: User) -> ProfileOut:
    team_name = None
    if user.team_id:
        team_name = (await db.execute(select(Team.name).where(Team.id == user.team_id))).scalar_one_or_none()
    return ProfileOut(
        name=user.full_name, email=user.email, team_name=team_name, role=user.role.value,
        phone=user.phone, job_title=user.job_title, location=user.location, bio=user.bio,
        country=user.country,
    )


@router.get("/profile", response_model=ProfileOut)
async def get_profile(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return await _profile(db, user)


@router.patch("/profile", response_model=ProfileOut)
async def update_profile(body: ProfileUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        # `name` is this endpoint's one display-name field — split it onto
        # firstname/lastname (same rule as registration/invite), User.name
        # itself no longer exists as a column.
        name_value = (data.pop("name") or "").strip()
        if not name_value:
            raise HTTPException(status_code=422, detail="Name can't be empty")
        user.firstname, user.lastname = split_full_name(name_value)
    for key, value in data.items():
        setattr(user, key, value.strip() if isinstance(value, str) and value.strip() else None)
    await db.commit()
    await db.refresh(user)
    return await _profile(db, user)


@router.get("/notifications", response_model=list[LearnNotification])
async def notifications(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rows = (await db.execute(
        select(Certificate, Course.title).join(Course, Course.id == Certificate.course_id)
        .where(Certificate.user_id == user.id).order_by(Certificate.issued_at.desc()).limit(20)
    )).all()
    return [LearnNotification(id=str(c.id), kind="certificate", title=f"You earned a certificate for {t}", at=c.issued_at) for c, t in rows]


@router.get("/certificates/{cert_id}", response_model=CertDetail)
async def certificate_detail(cert_id: uuid.UUID, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    row = (await db.execute(
        select(Certificate, Course)
        .join(Course, Course.id == Certificate.course_id)
        .where(Certificate.id == cert_id, Certificate.user_id == user.id)  # only your own
    )).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Certificate not found")
    cert, course = row
    template = None
    if cert.template_id:
        template = (await db.execute(select(CertTemplate).where(CertTemplate.id == cert.template_id))).scalar_one_or_none()
    if template is None:
        template = await ensure_org_has_a_template(db, user.org_id)
    org_name = (await db.execute(select(Org.name).where(Org.id == user.org_id))).scalar_one()
    return CertDetail(
        id=cert.id, code=cert.code, learner_name=user.full_name, course_title=course.title,
        certification_name=course.certificate_name or course.title,
        issuer_name=course.certificate_org_name or org_name, duration=course.duration_label or "—",
        issued_at=cert.issued_at, template=template,
    )

import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityDay
from app.models.badge import Badge, BadgeCriteria
from app.models.certificate import Certificate
from app.models.course import Course
from app.models.module import Module, ModuleType
from app.models.module_progress import ModuleProgress
from app.models.quiz_attempt import QuizAttempt
from app.models.skill import Skill
from app.models.team import Team
from app.models.user import RoleName, User, UserStatus
from app.services.certificate_service import issue_certificate

POINTS_PER_MODULE = 10
POINTS_PER_COURSE = 50
POINTS_PER_PERFECT_QUIZ = 20


# ---------- assignment & progress ----------
async def assigned_courses(db: AsyncSession, user: User) -> list[Course]:
    cond = Course.assigned_user_ids.any(user.id)
    if user.team_id is not None:
        cond = cond | Course.assigned_team_ids.any(user.team_id)
    rows = await db.execute(select(Course).where(Course.org_id == user.org_id, cond).order_by(Course.title))
    return list(rows.scalars().all())


async def assigned_course_or_404(db: AsyncSession, user: User, course_id: uuid.UUID) -> Course:
    for c in await assigned_courses(db, user):
        if c.id == course_id:
            return c
    raise HTTPException(status_code=404, detail="Course not found")


async def completed_map(db: AsyncSession, user_id: uuid.UUID) -> dict[uuid.UUID, ModuleProgress]:
    rows = await db.execute(select(ModuleProgress).where(ModuleProgress.user_id == user_id))
    return {mp.module_id: mp for mp in rows.scalars().all()}


def _counted_modules(course: Course) -> list[Module]:
    required = [m for m in course.modules if m.required]
    return required or list(course.modules)


def course_progress(course: Course, done: dict) -> tuple[int, int, int]:
    """(percent, completed_modules, total_counted_modules) — only required modules count
    (all of them if none are flagged required)."""
    counted = _counted_modules(course)
    if not counted:
        return 0, 0, 0
    n = sum(1 for m in counted if m.id in done)
    return round(100 * n / len(counted)), n, len(counted)


def status_for(pct: int) -> str:
    return "completed" if pct >= 100 else "not_started" if pct == 0 else "in_progress"


# ---------- activity / streak ----------
async def touch_activity(db: AsyncSession, user_id: uuid.UUID) -> None:
    stmt = pg_insert(ActivityDay).values(user_id=user_id, day=date.today()).on_conflict_do_nothing()
    await db.execute(stmt)
    await db.commit()


async def streak_for(db: AsyncSession, user_id: uuid.UUID) -> int:
    rows = await db.execute(select(ActivityDay.day).where(ActivityDay.user_id == user_id).order_by(ActivityDay.day.desc()).limit(400))
    days = [r[0] for r in rows.all()]
    if not days:
        return 0
    cursor = date.today()
    if days[0] != cursor:  # allow a streak that is alive as of yesterday
        cursor = cursor - timedelta(days=1)
        if days[0] != cursor:
            return 0
    n = 0
    for d in days:
        if d == cursor:
            n += 1
            cursor -= timedelta(days=1)
        elif d < cursor:
            break
    return n


async def trained_week(db: AsyncSession, user_id: uuid.UUID) -> list[bool]:
    today = date.today()
    monday = today - timedelta(days=today.weekday())
    start = datetime.combine(monday, datetime.min.time(), tzinfo=timezone.utc)
    rows = await db.execute(select(ModuleProgress.completed_at).where(ModuleProgress.user_id == user_id, ModuleProgress.completed_at >= start))
    trained = {r[0].date().weekday() for r in rows.all()}
    return [i in trained for i in range(5)]


# ---------- points / leaderboard ----------
async def points_by_user(db: AsyncSession, org_id: uuid.UUID) -> dict[uuid.UUID, int]:
    pts: dict[uuid.UUID, int] = {}
    mods = await db.execute(
        select(ModuleProgress.user_id, func.count()).where(ModuleProgress.org_id == org_id).group_by(ModuleProgress.user_id)
    )
    for uid, n in mods.all():
        pts[uid] = pts.get(uid, 0) + n * POINTS_PER_MODULE
    perfect = await db.execute(
        select(QuizAttempt.user_id, func.count(func.distinct(QuizAttempt.module_id)))
        .where(QuizAttempt.org_id == org_id, QuizAttempt.score == 100).group_by(QuizAttempt.user_id)
    )
    for uid, n in perfect.all():
        pts[uid] = pts.get(uid, 0) + n * POINTS_PER_PERFECT_QUIZ
    certs = await db.execute(
        select(Certificate.user_id, func.count()).where(Certificate.org_id == org_id).group_by(Certificate.user_id)
    )
    for uid, n in certs.all():
        pts[uid] = pts.get(uid, 0) + n * POINTS_PER_COURSE
    return pts


async def leaderboard(db: AsyncSession, me: User) -> list[dict]:
    pts = await points_by_user(db, me.org_id)
    rows = await db.execute(
        select(User, Team.name)
        .outerjoin(Team, Team.id == User.team_id)
        .where(User.org_id == me.org_id, User.role == RoleName.LEARNER, User.status.in_([UserStatus.ACTIVE, UserStatus.INVITED]))
    )
    board = [
        {"id": u.id, "name": u.name, "team_name": tname, "points": pts.get(u.id, 0), "is_me": u.id == me.id}
        for u, tname in rows.all()
    ]
    board.sort(key=lambda r: (-r["points"], r["name"].lower()))
    return board


# ---------- completing things ----------
async def _mark_done(db: AsyncSession, user: User, course: Course, module: Module, score: int | None) -> None:
    existing = (await db.execute(
        select(ModuleProgress).where(ModuleProgress.user_id == user.id, ModuleProgress.module_id == module.id)
    )).scalar_one_or_none()
    if existing:
        if score is not None and (existing.score or 0) < score:
            existing.score = score
        return
    db.add(ModuleProgress(org_id=user.org_id, user_id=user.id, course_id=course.id, module_id=module.id, score=score))
    await db.flush()


async def _finish_course_if_done(db: AsyncSession, user: User, course: Course) -> tuple[int, bool, str | None]:
    done = await completed_map(db, user.id)
    pct, _, _ = course_progress(course, done)
    code = None
    completed = pct >= 100
    if completed and course.certificate_enabled:
        have = (await db.execute(
            select(Certificate).where(Certificate.user_id == user.id, Certificate.course_id == course.id)
        )).scalar_one_or_none()
        if have is None:
            cert = await issue_certificate(db, user.org_id, user.id, course.id, course.certificate_template_id)
            code = cert.code
        else:
            code = have.code
    return pct, completed, code


async def complete_module(db: AsyncSession, user: User, module_id: uuid.UUID) -> tuple[int, bool, str | None]:
    module, course = await _module_in_assigned_course(db, user, module_id)
    if module.type == ModuleType.QUIZ:
        raise HTTPException(status_code=400, detail="Quiz modules are completed by passing the quiz")
    await _mark_done(db, user, course, module, None)
    await db.commit()
    return await _finish_course_if_done(db, user, course)


async def _module_in_assigned_course(db: AsyncSession, user: User, module_id: uuid.UUID) -> tuple[Module, Course]:
    for course in await assigned_courses(db, user):
        for m in course.modules:
            if m.id == module_id:
                return m, course
    raise HTTPException(status_code=404, detail="Module not found")


async def submit_quiz(db: AsyncSession, user: User, module_id: uuid.UUID, answers: list[int]) -> dict:
    module, course = await _module_in_assigned_course(db, user, module_id)
    if module.type != ModuleType.QUIZ or not module.questions:
        raise HTTPException(status_code=400, detail="This module has no quiz")
    results = []
    right = 0
    for i, q in enumerate(module.questions):
        picked = answers[i] if i < len(answers) else None
        ok = picked == q.correct_index
        right += 1 if ok else 0
        results.append({"question_id": q.id, "picked": picked, "correct_index": q.correct_index, "correct": ok})
    score = round(100 * right / len(module.questions))
    db.add(QuizAttempt(org_id=user.org_id, user_id=user.id, module_id=module.id, score=score))
    passed = score >= module.threshold
    if passed:
        await _mark_done(db, user, course, module, score)
    await db.commit()
    pct, completed, code = await _finish_course_if_done(db, user, course)
    return {"score": score, "passed": passed, "threshold": module.threshold, "results": results,
            "progress": pct, "course_completed": completed, "certificate_code": code}


# ---------- progress screen ----------
async def build_progress(db: AsyncSession, user: User) -> dict:
    courses = await assigned_courses(db, user)
    done = await completed_map(db, user.id)
    streak = await streak_for(db, user.id)
    board = await leaderboard(db, user)
    me_row = next((r for r in board if r["id"] == user.id), None)
    rank = (board.index(me_row) + 1) if me_row else 0
    points = me_row["points"] if me_row else 0

    completed_courses = sum(1 for c in courses if course_progress(c, done)[0] >= 100)

    # skill radar: average over every module tagged with the skill, in the learner's assigned courses
    skills = (await db.execute(select(Skill).where(Skill.org_id == user.org_id).order_by(Skill.name))).scalars().all()
    skill_scores = []
    for s in skills:
        vals = []
        for c in courses:
            for m in c.modules:
                if s.id in (m.skill_ids or []):
                    mp = done.get(m.id)
                    if mp is None:
                        vals.append(0)
                    elif m.type == ModuleType.QUIZ and mp.score is not None:
                        vals.append(mp.score)
                    else:
                        vals.append(100)
        skill_scores.append({"id": s.id, "name": s.name, "value": round(sum(vals) / len(vals)) if vals else 0})

    # badges
    perfect = (await db.execute(
        select(func.count(func.distinct(QuizAttempt.module_id))).where(QuizAttempt.user_id == user.id, QuizAttempt.score == 100)
    )).scalar_one()
    team_rank_pct = None
    if user.team_id is not None and points > 0:
        member_ids = {r[0] for r in (await db.execute(select(User.id).where(User.team_id == user.team_id))).all()}
        teammates = [r for r in board if r["id"] in member_ids]
        pos = next((i for i, r in enumerate(teammates) if r["id"] == user.id), None)
        if pos is not None and teammates:
            team_rank_pct = 100 * (pos + 1) / len(teammates)
    badges = (await db.execute(select(Badge).where(Badge.org_id == user.org_id).order_by(Badge.name))).scalars().all()
    badge_out = []
    for b in badges:
        badge_out.append({"id": b.id, "name": b.name, "criteria": b.criteria.value, "value": b.value, "color": b.color,
                          "earned": _badge_earned(b, streak, perfect, team_rank_pct, courses, done)})

    certs = (await db.execute(
        select(Certificate, Course.title).join(Course, Course.id == Certificate.course_id)
        .where(Certificate.user_id == user.id).order_by(Certificate.issued_at.desc())
    )).all()
    return {
        "streak": streak, "completed_courses": completed_courses, "rank": rank, "points": points,
        "skills": skill_scores, "badges": badge_out,
        "certificates": [{"id": c.id, "course_title": t, "code": c.code, "issued_at": c.issued_at} for c, t in certs],
    }


def _int(v: str) -> int | None:
    try:
        return int(float(v))
    except (TypeError, ValueError):
        return None


def _badge_earned(b: Badge, streak: int, perfect: int, team_rank_pct, courses: list[Course], done: dict) -> bool:
    crit = b.criteria
    if crit == BadgeCriteria.STREAK:
        n = _int(b.value)
        return n is not None and streak >= n
    if crit == BadgeCriteria.PERFECT_SCORES:
        n = _int(b.value)
        return n is not None and perfect >= n
    if crit == BadgeCriteria.TEAM_RANK_PCT:
        n = _int(b.value)
        return n is not None and team_rank_pct is not None and team_rank_pct <= n
    if crit == BadgeCriteria.COURSE_COMPLETE:
        return any(str(c.id) == b.value.strip() and course_progress(c, done)[0] >= 100 for c in courses)
    if crit == BadgeCriteria.CATEGORY_COMPLETE:
        in_cat = [c for c in courses if c.category is not None and c.category.name.lower() == b.value.strip().lower()]
        return bool(in_cat) and all(course_progress(c, done)[0] >= 100 for c in in_cat)
    return False

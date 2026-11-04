"""Org-wide Reports & Analytics — the "how's the org actually doing"
view, one level above a single course's own Grades tab or a single
learner's own dashboard.

Same honesty rule as dashboard_service.py (see its module docstring):
every number here comes from a real stored row or a real computed
average over stored rows. No due-date/overdue concept, no historical
snapshot table — so this reports day-by-day *activity* (modules
completed, quiz attempts, certificates issued — all of which have a
real timestamp) rather than a fabricated "course completions over
time" line, since a course-level completion event itself isn't stored
for every course (only certificate-enabled ones get a timestamped
record, via Certificate.issued_at).

Team Lead scoping is the same rule used everywhere else in courses.py/
course_service.py: a Team Lead only ever sees their own team's
learners, never the whole org. list_enrolled/list_gradebook already
implement that per-course scoping, so course performance rows are
built by calling straight into them rather than re-deriving who's "in
scope" a second, possibly-inconsistent way.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.certificate import Certificate
from app.models.course import Course
from app.models.module_progress import ModuleProgress
from app.models.quiz_attempt import QuizAttempt
from app.models.user import RoleName, User, UserStatus
from app.schemas.report import ActivityPointOut, CoursePerformanceOut, ReportOverviewOut, ReportsOut
from app.services import course_service
from app.services import learn_service as progress_svc
from app.services.permission_service import is_team_scoped


def _learner_scope(query, viewer: User):
    """Every org-wide query here starts from the org; a Team Lead then
    narrows to just their own team, same restriction list_enrolled and
    list_gradebook already apply per-course."""
    query = query.where(User.org_id == viewer.org_id, User.role == RoleName.LEARNER)
    if is_team_scoped(viewer):
        query = query.where(User.team_id == viewer.team_id)
    return query


async def _scoped_learners(db: AsyncSession, viewer: User) -> list[User]:
    rows = await db.execute(_learner_scope(select(User), viewer).where(User.status.in_([UserStatus.ACTIVE, UserStatus.INVITED])))
    return list(rows.scalars().all())


async def _overview(db: AsyncSession, viewer: User, courses: list[Course]) -> ReportOverviewOut:
    learners = await _scoped_learners(db, viewer)
    total_courses = sum(1 for c in courses if c.published)

    pcts: list[int] = []
    for learner in learners:
        assigned = [
            c for c in courses
            if learner.id in (c.assigned_user_ids or [])
            or (learner.team_id is not None and learner.team_id in (c.assigned_team_ids or []))
        ]
        if not assigned:
            continue
        done = await progress_svc.completed_map(db, learner.id)
        pcts.extend(progress_svc.course_progress(c, done)[0] for c in assigned)

    avg_completion = round(sum(pcts) / len(pcts)) if pcts else 0
    not_started_pct = round(100 * sum(1 for p in pcts if p == 0) / len(pcts)) if pcts else 0

    cert_q = select(func.count(Certificate.id)).select_from(Certificate).join(User, User.id == Certificate.user_id).where(
        User.org_id == viewer.org_id, User.role == RoleName.LEARNER,
    )
    quiz_q = select(func.count(QuizAttempt.id)).select_from(QuizAttempt).join(User, User.id == QuizAttempt.user_id).where(
        User.org_id == viewer.org_id, User.role == RoleName.LEARNER,
    )
    quiz_pass_q = select(func.count(QuizAttempt.id)).select_from(QuizAttempt).join(User, User.id == QuizAttempt.user_id).where(
        User.org_id == viewer.org_id, User.role == RoleName.LEARNER, QuizAttempt.passed == True,  # noqa: E712
    )
    if is_team_scoped(viewer):
        cert_q = cert_q.where(User.team_id == viewer.team_id)
        quiz_q = quiz_q.where(User.team_id == viewer.team_id)
        quiz_pass_q = quiz_pass_q.where(User.team_id == viewer.team_id)

    certificates_issued = (await db.execute(cert_q)).scalar() or 0
    quiz_attempts_total = (await db.execute(quiz_q)).scalar() or 0
    quiz_passed = (await db.execute(quiz_pass_q)).scalar() or 0
    quiz_pass_rate = round(100 * quiz_passed / quiz_attempts_total) if quiz_attempts_total else None

    return ReportOverviewOut(
        total_learners=len(learners), total_courses=total_courses,
        avg_completion_pct=avg_completion, not_started_pct=not_started_pct,
        certificates_issued=certificates_issued, quiz_attempts_total=quiz_attempts_total,
        quiz_pass_rate=quiz_pass_rate,
    )


async def _course_rows(db: AsyncSession, viewer: User, courses: list[Course]) -> list[CoursePerformanceOut]:
    # One batched query for certs-per-course beats N — there can be dozens
    # of courses in an org's catalogue.
    course_ids = [c.id for c in courses]
    cert_rows = await db.execute(
        select(Certificate.course_id, func.count(Certificate.id)).select_from(Certificate)
        .join(User, User.id == Certificate.user_id)
        .where(Certificate.course_id.in_(course_ids), User.org_id == viewer.org_id)
        .group_by(Certificate.course_id)
    )
    certs_by_course: dict[uuid.UUID, int] = {cid: n for cid, n in cert_rows.all()}

    out: list[CoursePerformanceOut] = []
    for course in courses:
        enrolled = await course_service.list_enrolled(db, course, viewer)
        if is_team_scoped(viewer) and not enrolled:
            continue  # nothing from this team is on this course — skip the empty row
        completed = sum(1 for r in enrolled if r.completed)
        gradebook = await course_service.list_gradebook(db, course, viewer)
        graded = [r for r in gradebook.learners if r.weighted_grade is not None]
        avg_grade = round(sum(r.weighted_grade for r in graded) / len(graded)) if graded else None
        pass_rate = round(100 * sum(1 for r in graded if r.passed) / len(graded)) if graded else None

        out.append(CoursePerformanceOut(
            course_id=str(course.id), title=course.title, published=course.published,
            enrolled_count=len(enrolled), completed_count=completed,
            completion_pct=round(100 * completed / len(enrolled)) if enrolled else None,
            avg_grade=avg_grade, pass_rate=pass_rate,
            certificates_issued=certs_by_course.get(course.id, 0),
        ))
    out.sort(key=lambda r: (-r.enrolled_count, r.title.lower()))
    return out


async def _trend(db: AsyncSession, viewer: User, days: int) -> list[ActivityPointOut]:
    since = datetime.now(timezone.utc) - timedelta(days=days - 1)
    # Certificate.issued_at is stored naive (see Certificate's own
    # docstring — asyncpg rejects an aware value against that column),
    # unlike ModuleProgress/QuizAttempt's timezone-aware columns.
    since_naive = since.replace(tzinfo=None)

    mp_q = select(func.date(ModuleProgress.completed_at), func.count(ModuleProgress.id)).select_from(ModuleProgress).join(
        User, User.id == ModuleProgress.user_id
    ).where(User.org_id == viewer.org_id, User.role == RoleName.LEARNER, ModuleProgress.completed_at >= since)
    qa_q = select(func.date(QuizAttempt.created_at), func.count(QuizAttempt.id)).select_from(QuizAttempt).join(
        User, User.id == QuizAttempt.user_id
    ).where(User.org_id == viewer.org_id, User.role == RoleName.LEARNER, QuizAttempt.created_at >= since)
    cert_q = select(func.date(Certificate.issued_at), func.count(Certificate.id)).select_from(Certificate).join(
        User, User.id == Certificate.user_id
    ).where(User.org_id == viewer.org_id, User.role == RoleName.LEARNER, Certificate.issued_at >= since_naive)
    if is_team_scoped(viewer):
        mp_q = mp_q.where(User.team_id == viewer.team_id)
        qa_q = qa_q.where(User.team_id == viewer.team_id)
        cert_q = cert_q.where(User.team_id == viewer.team_id)

    mp_rows = dict((await db.execute(mp_q.group_by(func.date(ModuleProgress.completed_at)))).all())
    qa_rows = dict((await db.execute(qa_q.group_by(func.date(QuizAttempt.created_at)))).all())
    cert_rows = dict((await db.execute(cert_q.group_by(func.date(Certificate.issued_at)))).all())

    today = datetime.now(timezone.utc).date()
    points: list[ActivityPointOut] = []
    for i in range(days):
        d = today - timedelta(days=days - 1 - i)
        points.append(ActivityPointOut(
            date=d,
            modules_completed=mp_rows.get(d, 0),
            quiz_attempts=qa_rows.get(d, 0),
            certificates_issued=cert_rows.get(d, 0),
        ))
    return points


async def build_reports(db: AsyncSession, viewer: User, days: int = 14) -> ReportsOut:
    courses = list((await db.execute(select(Course).where(Course.org_id == viewer.org_id))).scalars().all())
    overview = await _overview(db, viewer, courses)
    course_rows = await _course_rows(db, viewer, courses)
    trend = await _trend(db, viewer, days)
    return ReportsOut(overview=overview, courses=course_rows, trend=trend)

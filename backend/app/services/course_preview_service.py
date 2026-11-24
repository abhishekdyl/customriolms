"""Org Admin / course teacher previewing a course in its real learner-
facing flow — module completion, video/SCORM progress, quizzes, locks,
certificates, exactly like a real learner experiences it — WITHOUT
being "enrolled" (course.assigned_user_ids/assigned_team_ids) at all.

Why this is safe to just reuse the real learner tables (ModuleProgress,
WatchProgress, ScormProgress, QuizAttempt, Certificate) instead of a
parallel "preview" schema: every place that rolls these up into
something OTHER learners or the org admin's own reports can see
(Gradebook, Participants/"enrolled" list, the Recognition leaderboard)
already filters to `User.role == RoleName.LEARNER` — see
course_service.list_enrolled/gradebook and learn_service.leaderboard.
A previewing Org Admin/Team Lead/custom-role teacher is, by definition,
never role=LEARNER, so their own preview progress is automatically
invisible to every one of those — no extra flag or table needed.

Access: Org Admin/Super Admin, or anyone holding the courses.manage
capability (Team Lead/Custom Role included) — see require_preview_access.
This is deliberately broader than ratings moderation (can_moderate,
Org Admin/course-creator only) — previewing your own course build is a
much lower-stakes action than editing someone else's review.
"""
import uuid

from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.certificate import Certificate
from app.models.course import Course
from app.models.module_progress import ModuleProgress
from app.models.quiz_attempt import QuizAttempt
from app.models.scorm_progress import ScormProgress
from app.models.user import RoleName, User
from app.models.watch_progress import WatchProgress
from app.schemas.course import LearnerCourseOut
from app.services import learn_service
from app.services.course_service import _build_learner_course_out, get_course_or_404
from app.services.permission_service import has_capability


def require_preview_access(user: User) -> None:
    if user.role in (RoleName.SUPER_ADMIN, RoleName.ORG_ADMIN) or has_capability(user, "courses.manage"):
        return
    raise HTTPException(status_code=403, detail="You don't have access to preview courses")


async def get_preview_course(db: AsyncSession, course_id: uuid.UUID, user: User) -> LearnerCourseOut:
    """Same learner-facing shape as get_my_course, but reachable for ANY
    course in this user's org — draft or published, assigned or not —
    since this isn't a real enrolment. A still-draft MODULE inside it is
    still hidden (same as a real learner would see), so what's being
    tried out here is exactly the flow a learner would get once it's
    published, not a sneak peek at unfinished authoring."""
    course = await get_course_or_404(db, course_id, user.org_id)
    return await _build_learner_course_out(db, course, user)


async def _preview_course_or_404(db: AsyncSession, course_id: uuid.UUID, user: User) -> Course:
    return await get_course_or_404(db, course_id, user.org_id)


async def complete_module(
    db: AsyncSession, user: User, course_id: uuid.UUID, module_id: uuid.UUID,
    watched_pct: int | None = None, answers: list | None = None,
    scorm_score: int | None = None, scorm_passed: bool | None = None, scorm_status: str | None = None,
):
    course = await _preview_course_or_404(db, course_id, user)
    return await learn_service.complete_module(
        db, user, module_id, watched_pct=watched_pct, answers=answers,
        scorm_score=scorm_score, scorm_passed=scorm_passed, scorm_status=scorm_status,
        course_override=course,
    )


async def submit_quiz(db: AsyncSession, user: User, course_id: uuid.UUID, module_id: uuid.UUID, answers: list) -> dict:
    course = await _preview_course_or_404(db, course_id, user)
    return await learn_service.submit_quiz(db, user, module_id, answers, course_override=course)


async def checkpoint_watch_progress(
    db: AsyncSession, user: User, course_id: uuid.UUID, module_id: uuid.UUID, watched_pct: int | None, answer,
) -> WatchProgress:
    course = await _preview_course_or_404(db, course_id, user)
    return await learn_service.checkpoint_watch_progress(db, user, module_id, watched_pct, answer, course_override=course)


async def retake_watch_module(db: AsyncSession, user: User, course_id: uuid.UUID, module_id: uuid.UUID) -> WatchProgress:
    course = await _preview_course_or_404(db, course_id, user)
    return await learn_service.retake_watch_module(db, user, module_id, course_override=course)


async def checkpoint_scorm_progress(
    db: AsyncSession, user: User, course_id: uuid.UUID, module_id: uuid.UUID, cmi: dict,
) -> ScormProgress:
    course = await _preview_course_or_404(db, course_id, user)
    return await learn_service.checkpoint_scorm_progress(db, user, module_id, cmi, course_override=course)


async def retake_scorm_module(db: AsyncSession, user: User, course_id: uuid.UUID, module_id: uuid.UUID) -> ScormProgress:
    course = await _preview_course_or_404(db, course_id, user)
    return await learn_service.retake_scorm_module(db, user, module_id, course_override=course)


async def reset_preview_progress(db: AsyncSession, user: User, course_id: uuid.UUID) -> None:
    """Wipes this admin/teacher's OWN progress on this one course — their
    ModuleProgress rows, any WatchProgress/ScormProgress checkpoints,
    every QuizAttempt, and any certificate earned while previewing — so
    they can restart from module 1 as many times as they like. Scoped to
    (this user, this course) only; never touches a real learner's data,
    and never touches another admin/teacher's own preview progress on
    the same course either."""
    course = await _preview_course_or_404(db, course_id, user)
    module_ids = [m.id for m in course.modules]
    await db.execute(delete(ModuleProgress).where(ModuleProgress.user_id == user.id, ModuleProgress.course_id == course.id))
    if module_ids:
        await db.execute(delete(WatchProgress).where(WatchProgress.user_id == user.id, WatchProgress.module_id.in_(module_ids)))
        await db.execute(delete(ScormProgress).where(ScormProgress.user_id == user.id, ScormProgress.module_id.in_(module_ids)))
        await db.execute(delete(QuizAttempt).where(QuizAttempt.user_id == user.id, QuizAttempt.module_id.in_(module_ids)))
    await db.execute(delete(Certificate).where(Certificate.user_id == user.id, Certificate.course_id == course.id))
    await db.commit()

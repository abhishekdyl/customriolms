import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.activity import ActivityDay
from app.models.attempt_override import ModuleAttemptOverride
from app.models.badge import Badge, BadgeCriteria
from app.models.certificate import Certificate
from app.models.course import Course
from app.models.module import Module, ModuleType
from app.models.module_progress import ModuleProgress
from app.models.quiz_attempt import QuizAttempt
from app.models.skill import Skill
from app.models.team import Team
from app.models.user import RoleName, User, UserStatus
from app.models.watch_progress import WatchProgress
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


async def attempts_used_map(db: AsyncSession, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """How many QuizAttempt rows this learner already has per module —
    one query for the whole course view rather than one per quiz module.
    Used to show "X of Y attempts used" and to gate the retake button
    client-side (the real gate is still enforced server-side in
    submit_quiz — see _retake_gate)."""
    rows = await db.execute(
        select(QuizAttempt.module_id, func.count()).where(QuizAttempt.user_id == user_id).group_by(QuizAttempt.module_id)
    )
    return {module_id: count for module_id, count in rows.all()}


async def attempt_overrides_map(db: AsyncSession, user_id: uuid.UUID) -> dict[uuid.UUID, int]:
    """This learner's own per-module extra-attempts grants (see
    ModuleAttemptOverride) — an admin-set exception on top of whatever
    the module's retake_limit already allows them. Scoped to one user
    (never every learner's), since this is only ever used to compute
    what THIS learner is allowed."""
    rows = await db.execute(
        select(ModuleAttemptOverride.module_id, ModuleAttemptOverride.extra_attempts)
        .where(ModuleAttemptOverride.user_id == user_id)
    )
    return {module_id: extra for module_id, extra in rows.all()}


async def watch_progress_map(db: AsyncSession, user_id: uuid.UUID) -> dict[uuid.UUID, WatchProgress]:
    """This learner's resumable state for every WATCH module they've ever
    started — one query for the whole course view, same batching pattern
    as attempts_used_map/attempt_overrides_map above. Used to seed
    LearnerModuleOut.watch_furthest_pct/watch_answered_question_ids so the
    player can resume on mount without a separate round trip."""
    rows = await db.execute(select(WatchProgress).where(WatchProgress.user_id == user_id))
    return {wp.module_id: wp for wp in rows.scalars().all()}


def _retake_gate(module: Module, extra_attempts: int = 0) -> int | None:
    """The total number of attempts this module allows this learner
    (first try included), or None for unlimited. retake_enabled off
    means exactly one attempt ever, regardless of pass/fail — see
    Module's docstring. extra_attempts is this specific learner's own
    admin-granted exception (ModuleAttemptOverride), added on top —
    it applies even when retake_enabled is off, since an explicit
    per-learner grant is deliberately independent of the module's
    general policy. Has no effect when the module is already unlimited."""
    base = 1 if not module.retake_enabled else module.retake_limit
    return None if base is None else base + extra_attempts


def _counted_modules(course: Course) -> list[Module]:
    # A draft module (see Module.published) is invisible to the learner,
    # so it must never count toward — or block — their progress either.
    live = [m for m in course.modules if m.published]
    required = [m for m in live if m.required]
    return required or live


def course_progress(course: Course, done: dict) -> tuple[int, int, int]:
    """(percent, completed_modules, total_counted_modules) — only required
    modules count (all of them if none are flagged required).

    If the course has completion_module_ids set, that overrides the
    "every required module" rule entirely: the course is 100% complete
    the moment either EVERY module in that list is done (completion_mode
    "all", the default) or just ONE of them is (completion_mode "any"),
    whatever state anything else is in (e.g. "video + quiz together
    complete the course" even with a required, still-unwatched 3rd
    module). completed_modules/total still reflect the normal
    required-module count underneath, so the progress bar/matrix numbers
    stay meaningful even when the gate hasn't fired yet."""
    counted = _counted_modules(course)
    if not counted:
        return 0, 0, 0
    n = sum(1 for m in counted if m.id in done)
    gate_ids = course.completion_module_ids or []
    if gate_ids:
        gate_met = any(gid in done for gid in gate_ids) if course.completion_mode == "any" else all(gid in done for gid in gate_ids)
        if gate_met:
            return 100, n, len(counted)
    return round(100 * n / len(counted)), n, len(counted)


def ordered_modules(course: Course) -> list[Module]:
    # Draft modules (see Module.published) are excluded — sequential_unlock
    # must never make a published module wait on an invisible draft that
    # sits before it in position order and can never be completed.
    return sorted((m for m in course.modules if m.published), key=lambda m: m.position)


def _restriction_reason(course: Course, restriction: dict, done: dict, user: User) -> str | None:
    """None if this one restriction (one entry of Module.restrictions) is
    satisfied; otherwise the human-readable reason it isn't. Unknown
    restriction types never block — forward-compatible with whatever gets
    added later rather than locking everyone out of an old module."""
    rtype = restriction.get("type")

    if rtype == "date_window":
        now = datetime.now(timezone.utc)
        opens_at, closes_at = restriction.get("opens_at"), restriction.get("closes_at")
        if opens_at:
            dt = datetime.fromisoformat(opens_at) if isinstance(opens_at, str) else opens_at
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if now < dt:
                return f"Opens on {dt.strftime('%d %b %Y')}."
        if closes_at:
            dt = datetime.fromisoformat(closes_at) if isinstance(closes_at, str) else closes_at
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            if now > dt:
                return f"Was only available until {dt.strftime('%d %b %Y')}."
        return None

    if rtype == "profile_field":
        field, wanted = restriction.get("field"), (restriction.get("value") or "").strip().lower()
        actual = (getattr(user, field, None) or "").strip().lower()
        if actual != wanted:
            return f'Only available to learners whose {field} is "{restriction.get("value")}".'
        return None

    if rtype == "module_score":
        ref_id = restriction.get("module_id")
        ref_uuid = ref_id if isinstance(ref_id, uuid.UUID) else uuid.UUID(str(ref_id))
        min_score = restriction.get("min_score") or 0
        mp = done.get(ref_uuid)
        if mp is None or mp.score is None or mp.score < min_score:
            ref = next((m for m in course.modules if m.id == ref_uuid), None)
            ref_title = ref.title if ref else "an earlier module"
            return f'Score at least {min_score}% on "{ref_title}" first.'
        return None

    return None


def module_locked(course: Course, module: Module, done: dict, user: User) -> tuple[bool, str | None]:
    """(locked, reason) — (False, None) when nothing blocks this module.

    Two independent gates, checked in order, either of which can lock it:
    1. sequential_unlock (course-wide, position order) — every module
       before this one must be done first (the "video > scorm > quiz >
       certificate" chain).
    2. module.restrictions (this module's own list — date windows, a
       learner profile field, or a minimum score on another module). ALL
       of them must pass; the first failing one's reason is returned.

    Both default to "nothing extra", so an existing module/course stays
    exactly as open as before either of these existed."""
    if course.sequential_unlock:
        ordered = ordered_modules(course)
        idx = next((i for i, m in enumerate(ordered) if m.id == module.id), None)
        if idx is not None and idx > 0 and ordered[idx - 1].id not in done:
            return True, f'Finish "{ordered[idx - 1].title}" first to unlock this module.'

    for restriction in (module.restrictions or []):
        reason = _restriction_reason(course, restriction, done, user)
        if reason:
            return True, reason

    return False, None


def status_for(pct: int) -> str:
    return "completed" if pct >= 100 else "not_started" if pct == 0 else "in_progress"


def assert_course_open(course: Course) -> None:
    """opens_at/closes_at are a hard window on new learner progress — not on
    admin editing, and not retroactive on what's already completed. Called
    right before recording a completion or a quiz attempt."""
    now = datetime.now(timezone.utc)
    if course.opens_at is not None and now < course.opens_at:
        raise HTTPException(status_code=403, detail="This course hasn't opened yet")
    if course.closes_at is not None and now > course.closes_at:
        raise HTTPException(status_code=403, detail="This course is closed")


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
        {"id": u.id, "name": u.full_name, "team_name": tname, "points": pts.get(u.id, 0), "is_me": u.id == me.id}
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


async def _assert_module_unlocked(db: AsyncSession, user: User, course: Course, module: Module) -> None:
    done = await completed_map(db, user.id)
    locked, reason = module_locked(course, module, done, user)
    if locked:
        raise HTTPException(status_code=403, detail=reason or "This module is locked.")


async def _get_or_create_watch_progress(db: AsyncSession, user: User, module: Module) -> WatchProgress:
    wp = (await db.execute(
        select(WatchProgress).where(WatchProgress.user_id == user.id, WatchProgress.module_id == module.id)
    )).scalar_one_or_none()
    if wp is None:
        wp = WatchProgress(org_id=user.org_id, user_id=user.id, module_id=module.id)
        db.add(wp)
        await db.flush()
    return wp


class _CollectedAnswer:
    """Reconstructs a QuizAnswerIn-shaped object from a persisted
    WatchProgress.answers_json entry, so _score_questions (which expects
    .question_id/.option_id/.text attributes) can score the FULL merged
    answer set — not just whatever the client happened to send in this one
    request — without needing a second, JSONB-flavored scoring path."""
    def __init__(self, question_id: uuid.UUID, option_id: str | None, text: str | None):
        self.question_id = question_id
        self.option_id = option_id
        self.text = text


async def checkpoint_watch_progress(
    db: AsyncSession, user: User, module_id: uuid.UUID, watched_pct: int | None, answer,
) -> WatchProgress:
    """Called continuously during playback (on an interval for pct, and
    immediately whenever the learner submits an in-video question) so a
    reload / new tab / fresh login resumes exactly where they left off —
    the whole point of this feature. Never gated: checkpointing is not an
    attempt, only submitting the module via complete_module is, so there's
    nothing here to block even on a module with no attempts left."""
    module, _course = await _module_in_assigned_course(db, user, module_id)
    if module.type != ModuleType.WATCH:
        raise HTTPException(status_code=400, detail="This module isn't a WATCH module")
    wp = await _get_or_create_watch_progress(db, user, module)
    if watched_pct is not None:
        wp.furthest_pct = max(wp.furthest_pct, watched_pct)
    if answer is not None:
        merged = dict(wp.answers_json or {})
        merged[str(answer.question_id)] = {"option_id": answer.option_id, "text": answer.text}
        wp.answers_json = merged  # reassigned (not mutated in place) so SQLAlchemy sees the change
    await db.commit()
    return wp


async def retake_watch_module(db: AsyncSession, user: User, module_id: uuid.UUID) -> WatchProgress:
    """Explicit "retake" action for a WATCH module's in-video questions —
    mirrors submit_quiz's retake gate exactly (same _retake_gate, same
    attempts-used count, same per-learner ModuleAttemptOverride), since the
    user asked for "same as quiz" here. Resets the persisted progress row
    (fresh answers, fresh furthest_pct, attempt_number bumped) so the next
    playthrough asks every in-video question again instead of skipping the
    ones already answered in the just-finished attempt. The video itself
    was always freely replayable — this only resets which QUESTIONS show."""
    module, course = await _module_in_assigned_course(db, user, module_id)
    if module.type != ModuleType.WATCH:
        raise HTTPException(status_code=400, detail="This module isn't a WATCH module")
    assert_course_open(course)

    attempts_so_far = (await db.execute(
        select(func.count()).select_from(QuizAttempt).where(QuizAttempt.user_id == user.id, QuizAttempt.module_id == module.id)
    )).scalar_one()
    override = (await db.execute(
        select(ModuleAttemptOverride.extra_attempts)
        .where(ModuleAttemptOverride.user_id == user.id, ModuleAttemptOverride.module_id == module.id)
    )).scalar_one_or_none()
    limit = _retake_gate(module, override or 0)
    if limit is not None and attempts_so_far >= limit:
        detail = (
            "Retakes aren't allowed for this video's questions — you've already submitted your one attempt."
            if limit == 1 else
            f"You've used all {limit} attempts allowed for this video's questions."
        )
        raise HTTPException(status_code=403, detail=detail)

    wp = await _get_or_create_watch_progress(db, user, module)
    wp.attempt_number += 1
    wp.furthest_pct = 0
    wp.answers_json = {}
    await db.commit()
    return wp


async def complete_module(
    db: AsyncSession, user: User, module_id: uuid.UUID, watched_pct: int | None = None, answers: list | None = None,
) -> tuple[int, bool, str | None, list[dict], int | None, int | None, int, int | None, bool]:
    module, course = await _module_in_assigned_course(db, user, module_id)
    if module.type == ModuleType.QUIZ:
        raise HTTPException(status_code=400, detail="Quiz modules are completed by passing the quiz")
    assert_course_open(course)
    await _assert_module_unlocked(db, user, course, module)

    score = None
    video_question_results: list[dict] = []
    video_earned_points: int | None = None
    video_total_points: int | None = None
    attempts_used = 1
    attempts_remaining: int | None = None
    retake_allowed = False
    if module.type == ModuleType.WATCH:
        # Mirrors the QUIZ gate below — a WATCH module's own `threshold` is
        # its pass mark too ("min % watched (WATCH) or min score (QUIZ)",
        # see Module's docstring), just not enforced here until now. The
        # player tracks the furthest point reached and sends it as
        # watched_pct; a module with threshold 0 (the common case before
        # this existed) still passes with no video played at all, so this
        # never breaks an already-authored module that wasn't set up to
        # require real watch-through.
        pct = watched_pct or 0
        if pct < module.threshold:
            raise HTTPException(
                status_code=400,
                detail=f"Watch at least {module.threshold}% of the video first — you're at {pct}%.",
            )

        # In-video questions (trigger_time_sec set) are an extra gate on
        # top of watched_pct, not a replacement for it — org-admin set via
        # Module.video_question_min_correct. A module with no in-video
        # questions (the pre-existing WATCH flow) just skips all of this,
        # same behavior as before this feature existed.
        in_video_questions = [q for q in module.questions if q.trigger_time_sec is not None]
        if in_video_questions:
            # Same retake gate as submit_quiz, checked BEFORE scoring —
            # once this module's attempts are exhausted, no further
            # submission is scored at all (an explicit retake_watch_module
            # call is what resets the WatchProgress row for a fresh round;
            # see its docstring). This also means a double "Mark complete"
            # click behaves exactly like a double quiz submit does today.
            attempts_so_far = (await db.execute(
                select(func.count()).select_from(QuizAttempt).where(QuizAttempt.user_id == user.id, QuizAttempt.module_id == module.id)
            )).scalar_one()
            override = (await db.execute(
                select(ModuleAttemptOverride.extra_attempts)
                .where(ModuleAttemptOverride.user_id == user.id, ModuleAttemptOverride.module_id == module.id)
            )).scalar_one_or_none()
            limit = _retake_gate(module, override or 0)
            if limit is not None and attempts_so_far >= limit:
                detail = (
                    "Retakes aren't allowed for this video's questions — you've already submitted your one attempt."
                    if limit == 1 else
                    f"You've used all {limit} attempts allowed for this video's questions."
                )
                raise HTTPException(status_code=403, detail=detail)

            # Score off the FULL persisted answer set (this submission's
            # answers merged on top of whatever was already checkpointed),
            # not just whatever happens to be in this one request — a
            # reload mid-video must never cost the learner credit for
            # questions they already answered before the reload.
            wp = await _get_or_create_watch_progress(db, user, module)
            wp.furthest_pct = max(wp.furthest_pct, pct)
            merged = dict(wp.answers_json or {})
            for a in (answers or []):
                merged[str(a.question_id)] = {"option_id": a.option_id, "text": a.text}
            wp.answers_json = merged
            scoring_answers = [
                _CollectedAnswer(uuid.UUID(qid), v.get("option_id"), v.get("text")) for qid, v in merged.items()
            ]

            video_question_results, snapshot, right, earned_points, total_points = _score_questions(in_video_questions, scoring_answers)
            min_correct = module.video_question_min_correct
            passed_gate = min_correct is None or right >= min_correct

            # Always persisted (pass or fail), same "every submission gets
            # a row" rule as a QUIZ module's QuizAttempt — score here is
            # the % of in-video questions answered correctly, independent
            # of watched_pct (which is what ModuleProgress.score ends up
            # holding instead, for the module-progress matrix/leaderboard).
            # Committed BEFORE the gate can raise below, so a failed
            # attempt is recorded too — this used to be silently discarded.
            iv_score = round(100 * right / len(in_video_questions))
            db.add(QuizAttempt(
                org_id=user.org_id, user_id=user.id, module_id=module.id, score=iv_score,
                earned_points=earned_points, total_points=total_points,
                passed=passed_gate, answers_json=snapshot,
            ))
            await db.commit()
            video_earned_points, video_total_points = earned_points, total_points
            attempts_used = attempts_so_far + 1
            attempts_remaining = None if limit is None else max(0, limit - attempts_used)
            retake_allowed = limit is None or attempts_used < limit

            if not passed_gate:
                raise HTTPException(
                    status_code=400,
                    detail=f"Answer at least {min_correct} in-video question(s) correctly — you got {right}.",
                )
        score = pct

    await _mark_done(db, user, course, module, score)
    await db.commit()
    pct, completed, code = await _finish_course_if_done(db, user, course)
    return pct, completed, code, video_question_results, video_earned_points, video_total_points, attempts_used, attempts_remaining, retake_allowed


async def _module_in_assigned_course(db: AsyncSession, user: User, module_id: uuid.UUID) -> tuple[Module, Course]:
    for course in await assigned_courses(db, user):
        for m in course.modules:
            # A still-draft module (see Module.published) is treated as
            # not existing for the learner — defense in depth, since it's
            # already hidden from the module list this id would come from.
            if m.id == module_id and m.published:
                return m, course
    raise HTTPException(status_code=404, detail="Module not found")


def _short_answer_correct(picked_text: str | None, accepted: list[str]) -> bool:
    picked = (picked_text or "").strip().lower()
    return bool(picked) and any(picked == (a or "").strip().lower() for a in accepted)


def _score_questions(questions: list, answers: list) -> tuple[list[dict], list[dict], int, int, int]:
    """Shared by submit_quiz (QUIZ modules) and complete_module's WATCH
    in-video-question branch — same per-question correctness logic either
    way. Returns (results, snapshot, right_count, earned_points, total_points).

    A question absent from `answers` (never answered — including a
    skipped-on-timeout in-video question, see QuizAnswerIn's docstring)
    simply scores not-correct here; it's the caller's job to not otherwise
    penalize a skip beyond that (no negative marking either way)."""
    answers_by_question = {a.question_id: a for a in answers}
    results = []
    snapshot = []  # same data as `results`, plus the question/option text — stored on
                    # the attempt so an admin can see exactly what was asked and picked
                    # even if the question is later edited or deleted (see QuizAttempt's docstring)
    right = 0
    earned_points = 0
    total_points = sum(q.points or 1 for q in questions)
    for q in questions:
        ans = answers_by_question.get(q.id)
        picked_option_id = ans.option_id if ans else None
        picked_text = ans.text if ans else None
        options = q.options_json or []
        if q.type.value == "short_answer":
            ok = _short_answer_correct(picked_text, q.accepted_answers or [])
        else:
            ok = picked_option_id is not None and picked_option_id == q.correct_option_id
        right += 1 if ok else 0
        earned_points += (q.points or 1) if ok else 0
        results.append({
            "question_id": q.id, "picked_option_id": picked_option_id, "picked_text": picked_text,
            "correct_option_id": q.correct_option_id, "correct": ok,
        })

        def _option_text(option_id: str | None) -> str | None:
            if not option_id:
                return None
            return next((o.get("text") for o in options if o.get("id") == option_id), None)

        snapshot.append({
            "question_id": str(q.id), "question_type": q.type.value, "question_text": q.text,
            "options": [{"id": o.get("id"), "text": o.get("text")} for o in options],
            "picked_option_id": picked_option_id, "picked_option_text": _option_text(picked_option_id),
            "picked_text": picked_text,
            "correct_option_id": q.correct_option_id, "correct_option_text": _option_text(q.correct_option_id),
            "accepted_answers": q.accepted_answers or [],
            "correct": ok,
            "points": q.points or 1,
        })
    return results, snapshot, right, earned_points, total_points


async def submit_quiz(db: AsyncSession, user: User, module_id: uuid.UUID, answers: list) -> dict:
    """`answers` is a list of QuizAnswerIn (schemas/learn.py) — each keyed by
    question_id rather than position, so scoring doesn't depend on the
    client sending questions back in the same order it received them.

    MCQ/TRUE_FALSE: correct iff the picked option_id matches the question's
    correct_option_id. SHORT_ANSWER: correct iff the picked text
    case-insensitively matches one of accepted_answers."""
    module, course = await _module_in_assigned_course(db, user, module_id)
    if module.type != ModuleType.QUIZ or not module.questions:
        raise HTTPException(status_code=400, detail="This module has no quiz")
    assert_course_open(course)
    await _assert_module_unlocked(db, user, course, module)

    attempts_so_far = (await db.execute(
        select(func.count()).select_from(QuizAttempt).where(QuizAttempt.user_id == user.id, QuizAttempt.module_id == module.id)
    )).scalar_one()
    override = (await db.execute(
        select(ModuleAttemptOverride.extra_attempts)
        .where(ModuleAttemptOverride.user_id == user.id, ModuleAttemptOverride.module_id == module.id)
    )).scalar_one_or_none()
    limit = _retake_gate(module, override or 0)
    if limit is not None and attempts_so_far >= limit:
        detail = (
            "Retakes aren't allowed for this quiz — you've already submitted your one attempt."
            if limit == 1 else
            f"You've used all {limit} attempts allowed for this quiz."
        )
        raise HTTPException(status_code=403, detail=detail)

    results, snapshot, right, earned_points, total_points = _score_questions(module.questions, answers)
    score = round(100 * right / len(module.questions))
    passed = score >= module.threshold
    db.add(QuizAttempt(
        org_id=user.org_id, user_id=user.id, module_id=module.id, score=score,
        earned_points=earned_points, total_points=total_points,
        passed=passed, answers_json=snapshot,
    ))
    if passed:
        # Only ever raises the recorded score (see _mark_done) — a later
        # attempt that scores lower than an earlier pass never undoes it,
        # so "the highest grade counts" holds even though every attempt
        # is still written to QuizAttempt above.
        await _mark_done(db, user, course, module, score)
    await db.commit()
    pct, completed, code = await _finish_course_if_done(db, user, course)
    attempts_used = attempts_so_far + 1
    retake_allowed = limit is None or attempts_used < limit
    return {"score": score, "passed": passed, "threshold": module.threshold, "results": results,
            "earned_points": earned_points, "total_points": total_points,
            "progress": pct, "course_completed": completed, "certificate_code": code,
            "attempts_used": attempts_used, "attempts_remaining": (None if limit is None else max(0, limit - attempts_used)),
            "retake_allowed": retake_allowed}


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

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.badge import Badge
from app.models.category import Category
from app.models.course import Course
from app.models.module import Module, ModuleQuizQuestion, ModuleType
from app.models.quiz_attempt import QuizAttempt
from app.models.skill import Skill
from app.models.team import Team
from app.models.user import RoleName, User
from app.schemas.course import (
    CourseListItem, CourseModuleProgressOut, EnrolledLearnerOut, LearnerCourseOut, LearnerModuleOut,
    LearnerModuleProgressOut, ModuleCreate, ModuleProgressCellOut, ModuleSummaryOut, ModuleUpdate, MyCourseItem,
    QuizAttemptOut,
)
from app.schemas.question import QuestionLearnerOut
# Real per-learner progress (ModuleProgress-backed) lives in
# learn_service — reused here rather than reimplemented so the
# course list/detail views and the /api/v1/learn/* endpoints never
# disagree about what "completed" means.
from app.services import learn_service as progress_svc
from app.services import scorm_service, storage_service


async def _validate_ids_belong_to_org(db: AsyncSession, model, ids: list[uuid.UUID], org_id: uuid.UUID, label: str) -> None:
    if not ids:
        return
    result = await db.execute(select(model.id).where(model.id.in_(ids), model.org_id == org_id))
    found = {row[0] for row in result.all()}
    missing = set(ids) - found
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown {label} id(s): {', '.join(str(m) for m in missing)}")


async def list_courses(db: AsyncSession, org_id: uuid.UUID) -> list[CourseListItem]:
    result = await db.execute(
        select(Course, Category.name.label("category_name"), func.count(Module.id).label("module_count"))
        .outerjoin(Category, Course.category_id == Category.id)
        .outerjoin(Module, Module.course_id == Course.id)
        .where(Course.org_id == org_id)
        .group_by(Course.id, Category.name)
    )
    items = []
    for course, category_name, module_count in result.all():
        items.append(CourseListItem(
            id=course.id, title=course.title, category_id=course.category_id, category_name=category_name,
            duration_label=course.duration_label, module_count=module_count,
            assigned_team_count=len(course.assigned_team_ids or []),
            opens_at=course.opens_at, closes_at=course.closes_at,
        ))
    return items


def _assigned_to(user: User) -> list:
    """SQL conditions meaning "this course is assigned to this user" — directly
    or through their team. The caller ORs them together.

    Uses the ARRAY column's own .any(value) comparator rather than the
    any_(column) == literal free function — the latter can't infer the
    bind parameter's type from a bare literal on the left and silently
    binds it as BOOLEAN instead of UUID, which asyncpg then rejects at
    execute time ("Not a boolean value: UUID(...)")."""
    conditions = [Course.assigned_user_ids.any(user.id)]
    if user.team_id is not None:
        conditions.append(Course.assigned_team_ids.any(user.team_id))
    return conditions


async def list_my_courses(db: AsyncSession, user: User) -> list[MyCourseItem]:
    """Courses assigned to this user — through their team or directly to
    them. Always scoped to the user's own org."""
    result = await db.execute(
        select(Course, Category.name.label("category_name"), func.count(Module.id).label("module_count"))
        .outerjoin(Category, Course.category_id == Category.id)
        # Only published modules count here — a learner's course card
        # shouldn't advertise a module they can't actually see yet (see
        # Module.published's docstring). The ON-clause condition (not a
        # WHERE) keeps the outer join's "0 modules" courses intact.
        .outerjoin(Module, (Module.course_id == Course.id) & (Module.published == True))  # noqa: E712
        .where(Course.org_id == user.org_id, or_(*_assigned_to(user)))
        .group_by(Course.id, Category.name)
        .order_by(Course.title)
    )
    rows = result.all()
    # modules isn't eagerly joined by the aggregate query above, so pull each
    # course's modules (already lazy="selectin" on the model) for the real
    # progress calculation rather than trusting module_count alone.
    courses = (await db.execute(
        select(Course).where(Course.id.in_([r[0].id for r in rows]))
    )).scalars().all()
    courses_by_id = {c.id: c for c in courses}
    done = await progress_svc.completed_map(db, user.id)
    out = []
    for course, category_name, module_count in rows:
        pct, _, _ = progress_svc.course_progress(courses_by_id[course.id], done)
        out.append(MyCourseItem(
            id=course.id, title=course.title, category_id=course.category_id, category_name=category_name,
            duration_label=course.duration_label, module_count=module_count,
            assigned_team_count=len(course.assigned_team_ids or []),
            opens_at=course.opens_at, closes_at=course.closes_at,
            progress_pct=pct,
        ))
    return out


async def get_my_course(db: AsyncSession, course_id: uuid.UUID, user: User) -> LearnerCourseOut:
    """One assigned course in its learner-safe shape (no quiz answers).
    A course that exists but isn't assigned to this user is a 404, same as
    one that doesn't exist — so ids can't be probed."""
    result = await db.execute(
        select(Course).where(Course.id == course_id, Course.org_id == user.org_id, or_(*_assigned_to(user)))
    )
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    done = await progress_svc.completed_map(db, user.id)
    pct, completed_count, _ = progress_svc.course_progress(course, done)
    modules = []
    for m in course.modules:
        # A draft module (see Module.published) — still being authored,
        # never explicitly saved yet — doesn't exist for the learner at
        # all, not even as a locked placeholder.
        if not m.published:
            continue
        # sequential_unlock and this module's own restrictions both gate
        # actual content, not just the "mark complete" click — a locked
        # module shows up in the list (so the learner can see what's
        # coming and why it's locked) but with no file to open and no
        # quiz questions to answer.
        locked, lock_reason = progress_svc.module_locked(course, m, done, user)
        modules.append(LearnerModuleOut(
            id=m.id, title=m.title, type=m.type, position=m.position, required=m.required, threshold=m.threshold,
            file_url=(
                None if locked else
                storage_service.presigned_get_url(m.file_key) if (m.file_key and m.type != ModuleType.SCORM) else m.file_url
            ),
            file_name=m.file_name, file_size_label=m.file_size_label,
            scorm_launch_path=None if locked else m.scorm_launch_path, scorm_version=m.scorm_version,
            instructions=m.instructions, skill_count=len(m.skill_ids or []),
            questions=[] if locked else [QuestionLearnerOut.model_validate(q) for q in (m.questions or [])],
            completed=m.id in done,
            score=done[m.id].score if m.id in done else None,
            locked=locked,
            lock_reason=lock_reason,
        ))
    return LearnerCourseOut(
        id=course.id, title=course.title, description=course.description,
        category_id=course.category_id, category_name=course.category.name if course.category else None,
        duration_label=course.duration_label, module_count=len(modules),
        assigned_team_count=len(course.assigned_team_ids or []),
        opens_at=course.opens_at, closes_at=course.closes_at,
        progress_pct=pct, modules=modules, completed_module_count=completed_count,
    )


async def get_course_or_404(db: AsyncSession, course_id: uuid.UUID, org_id: uuid.UUID) -> Course:
    from fastapi import HTTPException
    result = await db.execute(select(Course).where(Course.id == course_id, Course.org_id == org_id))
    course = result.scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")
    # category_name isn't a DB column (see CourseOut) — it's set here as a
    # plain transient attribute, read straight off the now selectin-loaded
    # `category` relationship, rather than a second query.
    course.category_name = course.category.name if course.category else None
    return course


async def assign_course(db: AsyncSession, course: Course, team_ids: list[uuid.UUID], user_ids: list[uuid.UUID]) -> Course:
    """Union-merge, never replace — assigning to a new team must never silently unassign an existing one."""
    if course.closes_at is not None and datetime.now(timezone.utc) > course.closes_at:
        raise HTTPException(status_code=400, detail="This course is closed — it can't be assigned to anyone new")
    course.assigned_team_ids = list(set(course.assigned_team_ids or []) | set(team_ids))
    course.assigned_user_ids = list(set(course.assigned_user_ids or []) | set(user_ids))
    await db.commit()
    # db.refresh() only reloads plain columns, not relationships, even
    # with lazy="selectin" — so re-fetching through the same helper the
    # GET endpoint uses is what actually keeps modules/category_name
    # populated in the response (see get_course_or_404's note above).
    return await get_course_or_404(db, course.id, course.org_id)


async def add_module(db: AsyncSession, course: Course, body: ModuleCreate) -> Module:
    result = await db.execute(select(func.max(Module.position)).where(Module.course_id == course.id))
    max_position = result.scalar() or 0
    module = Module(
        course_id=course.id, title=body.title, type=body.type,
        required=body.required, threshold=body.threshold, position=max_position + 1,
        # Starts as a draft — invisible to any learner (see Module.published's
        # docstring and learn_service's ordered_modules/_counted_modules) —
        # until the admin's first explicit Save on it, in update_module below.
        published=False,
    )
    db.add(module)
    await db.commit()
    # Not db.refresh() — see get_course_or_404's note; it doesn't reload
    # relationships (here, `questions`), only plain columns.
    return await _get_module_with_questions(db, module.id)


async def update_module(db: AsyncSession, module: Module, body: ModuleUpdate, org_id: uuid.UUID) -> Module:
    if body.skill_ids is not None:
        await _validate_ids_belong_to_org(db, Skill, body.skill_ids, org_id, "skill")
    if body.badge_ids is not None:
        await _validate_ids_belong_to_org(db, Badge, body.badge_ids, org_id, "badge")

    data = body.model_dump(exclude_unset=True, exclude={"questions", "restrictions"})
    for key, value in data.items():
        setattr(module, key, value)

    # Draft -> published gate (see Module.published's docstring): an
    # explicit `published` in the request always wins (lets the admin
    # manually un/republish). Otherwise, any ordinary explicit Save
    # finishes the "being authored" state — a still-draft module flips to
    # published the moment it's saved at all, matching "jab module ban
    # kar save ho tab learner ko dikhe" rather than requiring a separate
    # publish step on top of the Save button that already exists.
    if "published" not in data and not module.published:
        module.published = True

    if body.restrictions is not None:
        # mode="json" so each restriction's opens_at/closes_at/module_id
        # land as plain JSON-safe strings in the JSONB column — see
        # ModuleRestrictionIn's docstring for the shapes this stores, and
        # learn_service._restriction_reason for how they're read back.
        module.restrictions = [r.model_dump(mode="json", exclude_none=True) for r in body.restrictions]

    if body.questions is not None:
        # The module's resolved type after this PATCH — body.type if it's
        # changing type in the same request, else whatever it already is.
        resolved_type = body.type if body.type is not None else module.type
        if resolved_type is ModuleType.WATCH:
            for q in body.questions:
                if q.trigger_time_sec is None:
                    raise HTTPException(status_code=400, detail="Every in-video question needs a trigger_time_sec")
                if q.image_key or any(o.image_key for o in q.options):
                    raise HTTPException(status_code=400, detail="Picture questions can't be used in-video — remove the image")
        else:
            for q in body.questions:
                if q.trigger_time_sec is not None:
                    raise HTTPException(status_code=400, detail="trigger_time_sec only applies to WATCH modules")

        # Replace the full question set rather than diffing — authoring UI always
        # sends the complete list back on save, same as the frontend's own state model.
        for q in list(module.questions):
            await db.delete(q)
        for i, q in enumerate(body.questions):
            db.add(ModuleQuizQuestion(
                module_id=module.id, position=i, type=q.type, text=q.text, image_key=q.image_key,
                options_json=[o.model_dump() for o in q.options],
                correct_option_id=q.correct_option_id, accepted_answers=q.accepted_answers,
                trigger_time_sec=q.trigger_time_sec, timer_seconds=q.timer_seconds, points=q.points,
            ))

    await db.commit()
    return await _get_module_with_questions(db, module.id)


async def _get_module_with_questions(db: AsyncSession, module_id: uuid.UUID) -> Module:
    result = await db.execute(select(Module).where(Module.id == module_id))
    module = result.scalar_one()
    # expire_on_commit=False means a module already loaded earlier in this
    # request (its `questions` relationship already populated as whatever
    # it was then) won't pick up rows added/removed since — the identity
    # map just hands back the same object. Explicitly refreshing the
    # relationship re-runs its selectin load so callers always see the
    # current question set, not a stale one from before their own edit.
    await db.refresh(module, attribute_names=["questions"])
    return module


_MODULE_COMPONENT = {ModuleType.WATCH: "mod_watch", ModuleType.READ: "mod_read"}


async def upload_module_content(db: AsyncSession, module: Module, file, org_id: uuid.UUID, user: User) -> Module:
    """Uploads a WATCH (video) or READ (PDF/DOC/PPT) module's real file
    through the `files` dedup ledger (storage_service.store_file) and
    points the module at it. Replacing the file re-uses this module's one
    content slot (component/filearea/itemid, not filename — see
    storage_service._pathnamehash), so a re-upload updates the same
    `files` row and the old content is garbage-collected if nothing else
    references it, rather than silently piling up in riolmsdata."""
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    storage_service.validate_upload(file, module.type.value, size)

    record = await storage_service.store_file(
        db, file, org_id=org_id, component=_MODULE_COMPONENT[module.type], filearea="content",
        itemid=module.id, user=user,
    )
    module.file_key = storage_service.file_key(record)
    module.file_name = file.filename
    module.file_size_label = storage_service.size_label(size)
    await db.commit()

    return await _get_module_with_questions(db, module.id)


async def remove_module_content(db: AsyncSession, module: Module) -> None:
    is_scorm = module.type == ModuleType.SCORM
    had_content = bool(module.file_key)
    module.file_key = None
    module.file_name = None
    module.file_size_label = None
    module.file_url = None
    module.scorm_launch_path = None
    module.scorm_version = None
    await db.commit()
    if had_content:
        # SCORM is a whole package's worth of `files` rows sharing this
        # module's itemid (one per unpacked file, see upload_scorm_package);
        # a plain watch/read module has exactly one. Either way
        # delete_file_ref only physically removes a blob once no other
        # row anywhere still references its content.
        component = "mod_scorm" if is_scorm else _MODULE_COMPONENT[module.type]
        await storage_service.delete_file_ref(db, component=component, filearea="content" if not is_scorm else "package", itemid=module.id)
        # delete_file_ref only flushes (see storage_service) — without this
        # commit, its row deletions roll back when the request's session
        # closes even though the now-orphaned physical blob was already
        # deleted for real by the same call, leaving a dangling `files`
        # row pointing at nothing. Caught live: a first smoke-test run's
        # [f] step reported the GC as successful (correct inside that
        # transaction), but the row was still in Postgres on the next run.
        await db.commit()


async def upload_scorm_package(db: AsyncSession, module: Module, file, org_id: uuid.UUID, user: User) -> Module:
    """Unpacks a SCORM .zip and stores each unpacked file through the
    `files` dedup ledger — one row per file inside the package, all
    sharing this module's itemid, differentiated by filepath (its
    relative path inside the zip). Replaces any package the module
    already had: a re-upload's files overwrite the same slots where the
    relative paths match, and whatever's no longer present (file
    removed/renamed in the new package) is cleaned up explicitly below,
    not left as an orphaned row from the old package."""
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    if not (file.filename or "").lower().endswith(".zip"):
        raise HTTPException(status_code=400, detail="SCORM packages must be uploaded as a .zip")

    old_paths = await storage_service.list_slot_paths(db, component="mod_scorm", filearea="package", itemid=module.id)
    manifest = scorm_service.parse_zip(file, size)

    for entry_path, data in manifest.files:
        await storage_service.store_bytes(
            db, data, org_id=org_id, component="mod_scorm", filearea="package", itemid=module.id,
            filename=entry_path, filepath=entry_path, user=user,
        )

    # Any path the OLD package had that the NEW one doesn't gets dropped —
    # otherwise a renamed/removed asset from a prior upload would linger
    # in the ledger (and its blob, if nothing else references it) forever.
    new_paths = {p for p, _ in manifest.files}
    for stale_path in old_paths - new_paths:
        await storage_service.delete_file_ref_at(db, component="mod_scorm", filearea="package", itemid=module.id, filepath=stale_path)

    module.file_key = f"scorm/{module.id}"
    module.scorm_launch_path = manifest.launch_path
    module.scorm_version = manifest.version
    module.file_name = file.filename
    module.file_size_label = storage_service.size_label(size)
    await db.commit()

    return await _get_module_with_questions(db, module.id)


async def reorder_modules(db: AsyncSession, course: Course, ordered_ids: list[uuid.UUID]) -> None:
    modules_by_id = {m.id: m for m in course.modules}
    for i, module_id in enumerate(ordered_ids):
        if module_id in modules_by_id:
            modules_by_id[module_id].position = i
    await db.commit()


async def strip_skill_references(db: AsyncSession, skill_id: uuid.UUID, org_id: uuid.UUID) -> None:
    """Called by skill_service.delete_skill — a deleted skill must not linger in any module's tag list."""
    result = await db.execute(select(Module).join(Course).where(Course.org_id == org_id, Module.skill_ids.any(skill_id)))
    for module in result.scalars().all():
        module.skill_ids = [s for s in module.skill_ids if s != skill_id]
    await db.commit()


async def strip_badge_references(db: AsyncSession, badge_id: uuid.UUID, org_id: uuid.UUID) -> None:
    """Called by badge_service.delete_badge — mirrors strip_skill_references for both Course and Module badge_ids."""
    courses = await db.execute(select(Course).where(Course.org_id == org_id, Course.badge_ids.any(badge_id)))
    for course in courses.scalars().all():
        course.badge_ids = [b for b in course.badge_ids if b != badge_id]

    modules = await db.execute(select(Module).join(Course).where(Course.org_id == org_id, Module.badge_ids.any(badge_id)))
    for module in modules.scalars().all():
        module.badge_ids = [b for b in module.badge_ids if b != badge_id]

    await db.commit()


async def list_enrolled(db: AsyncSession, course: Course, viewer: User) -> list[EnrolledLearnerOut]:
    """Resolves a course's team + individual assignment into the actual
    list of enrolled learners, each with their own progress — the "who's
    actually enrolled" view a count badge can't answer. A Team Lead only
    sees their own team's members; an Org Admin sees everyone."""
    rows = await db.execute(
        select(User, Team.name).outerjoin(Team, Team.id == User.team_id)
        .where(User.org_id == course.org_id, User.role == RoleName.LEARNER)
    )
    out: list[EnrolledLearnerOut] = []
    for user, team_name in rows.all():
        if viewer.role == RoleName.TEAM_LEAD and user.team_id != viewer.team_id:
            continue
        via_direct = user.id in (course.assigned_user_ids or [])
        via_team = user.team_id is not None and user.team_id in (course.assigned_team_ids or [])
        if not via_direct and not via_team:
            continue
        done = await progress_svc.completed_map(db, user.id)
        pct, _, _ = progress_svc.course_progress(course, done)
        out.append(EnrolledLearnerOut(
            user_id=user.id, name=user.full_name, email=user.email, team_name=team_name,
            via="direct" if via_direct else "team", progress_pct=pct, completed=pct >= 100,
        ))
    out.sort(key=lambda r: r.name.lower())
    return out


async def list_module_progress(db: AsyncSession, course: Course, viewer: User) -> CourseModuleProgressOut:
    """The Moodle-style "who completed which module" matrix — same
    enrolled-learner resolution and Team Lead scoping as list_enrolled,
    just shaped as a row per learner with one cell per module instead of
    a single rolled-up progress_pct, so an admin can see exactly which
    modules a given learner has and hasn't cleared, not just their overall
    percentage."""
    modules = sorted(course.modules, key=lambda m: m.position)
    module_summaries = [
        ModuleSummaryOut(id=m.id, title=m.title, type=m.type.value, required=m.required) for m in modules
    ]

    rows = await db.execute(
        select(User, Team.name).outerjoin(Team, Team.id == User.team_id)
        .where(User.org_id == course.org_id, User.role == RoleName.LEARNER)
    )
    learners: list[LearnerModuleProgressOut] = []
    for user, team_name in rows.all():
        if viewer.role == RoleName.TEAM_LEAD and user.team_id != viewer.team_id:
            continue
        via_direct = user.id in (course.assigned_user_ids or [])
        via_team = user.team_id is not None and user.team_id in (course.assigned_team_ids or [])
        if not via_direct and not via_team:
            continue
        done = await progress_svc.completed_map(db, user.id)
        pct, _, _ = progress_svc.course_progress(course, done)
        cells = [
            ModuleProgressCellOut(module_id=m.id, completed=m.id in done, score=done[m.id].score if m.id in done else None)
            for m in modules
        ]
        learners.append(LearnerModuleProgressOut(
            user_id=user.id, name=user.full_name, email=user.email, team_name=team_name,
            course_completed=pct >= 100, cells=cells,
        ))
    learners.sort(key=lambda r: r.name.lower())
    return CourseModuleProgressOut(modules=module_summaries, learners=learners)


async def list_quiz_attempts(db: AsyncSession, course: Course, viewer: User) -> list[QuizAttemptOut]:
    """Every submission of every quiz module in this course, pass or fail,
    with exactly what each learner answered — the Moodle-style "quiz
    submissions" review for an Org Admin (everyone) or Team Lead (their
    own team only), newest first."""
    rows = await db.execute(
        select(QuizAttempt, User, Module.title)
        .join(User, User.id == QuizAttempt.user_id)
        .join(Module, Module.id == QuizAttempt.module_id)
        .where(Module.course_id == course.id, QuizAttempt.org_id == course.org_id)
        .order_by(QuizAttempt.created_at.desc())
    )
    out: list[QuizAttemptOut] = []
    for attempt, user, module_title in rows.all():
        if viewer.role == RoleName.TEAM_LEAD and user.team_id != viewer.team_id:
            continue
        out.append(QuizAttemptOut(
            id=attempt.id, user_id=user.id, user_name=user.full_name, user_email=user.email,
            module_id=attempt.module_id, module_title=module_title,
            score=attempt.score, passed=attempt.passed,
            earned_points=attempt.earned_points, total_points=attempt.total_points,
            created_at=attempt.created_at,
            answers=attempt.answers_json or [],
        ))
    return out

import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.badge import Badge
from app.models.category import Category
from app.models.course import Course
from app.models.module import Module, ModuleQuizQuestion
from app.models.skill import Skill
from app.models.team import Team
from app.models.user import RoleName, User
from app.schemas.course import (
    CourseListItem, EnrolledLearnerOut, LearnerCourseOut, LearnerModuleOut, LearnerQuizQuestionOut,
    ModuleCreate, ModuleUpdate, MyCourseItem,
)
# Real per-learner progress (ModuleProgress-backed) lives in
# learn_service — reused here rather than reimplemented so the
# course list/detail views and the /api/v1/learn/* endpoints never
# disagree about what "completed" means.
from app.services import learn_service as progress_svc
from app.services import storage_service


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
        .outerjoin(Module, Module.course_id == Course.id)
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
    modules = [
        LearnerModuleOut(
            id=m.id, title=m.title, type=m.type, position=m.position, required=m.required, threshold=m.threshold,
            file_url=storage_service.presigned_get_url(m.file_key) if m.file_key else m.file_url,
            file_name=m.file_name, file_size_label=m.file_size_label,
            instructions=m.instructions, skill_count=len(m.skill_ids or []),
            questions=[LearnerQuizQuestionOut(id=q.id, text=q.text, options=list(q.options)) for q in (m.questions or [])],
            completed=m.id in done,
        )
        for m in course.modules
    ]
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

    data = body.model_dump(exclude_unset=True, exclude={"questions"})
    for key, value in data.items():
        setattr(module, key, value)

    if body.questions is not None:
        # Replace the full question set rather than diffing — authoring UI always
        # sends the complete list back on save, same as the frontend's own state model.
        for q in list(module.questions):
            await db.delete(q)
        for i, q in enumerate(body.questions):
            db.add(ModuleQuizQuestion(module_id=module.id, position=i, text=q.text, options=q.options, correct_index=q.correct_index))

    await db.commit()
    return await _get_module_with_questions(db, module.id)


async def _get_module_with_questions(db: AsyncSession, module_id: uuid.UUID) -> Module:
    result = await db.execute(select(Module).where(Module.id == module_id))
    return result.scalar_one()


async def upload_module_content(db: AsyncSession, module: Module, file) -> Module:
    """Uploads a WATCH (video) or READ (PDF/DOC/PPT) module's real file to
    object storage and points the module at it. Replaces whatever file the
    module already had — the old object is best-effort deleted so storage
    doesn't quietly accumulate orphans every time someone re-uploads."""
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    storage_service.validate_upload(file, module.type.value, size)

    old_key = module.file_key
    key = storage_service.build_key(module.id, file.filename or "file")
    storage_service.upload_fileobj(key, file)

    module.file_key = key
    module.file_name = file.filename
    module.file_size_label = storage_service.size_label(size)
    await db.commit()

    if old_key and old_key != key:
        storage_service.delete_object(old_key)

    return await _get_module_with_questions(db, module.id)


async def remove_module_content(db: AsyncSession, module: Module) -> None:
    old_key = module.file_key
    module.file_key = None
    module.file_name = None
    module.file_size_label = None
    module.file_url = None
    await db.commit()
    if old_key:
        storage_service.delete_object(old_key)


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
            user_id=user.id, name=user.name, email=user.email, team_name=team_name,
            via="direct" if via_direct else "team", progress_pct=pct, completed=pct >= 100,
        ))
    out.sort(key=lambda r: r.name.lower())
    return out

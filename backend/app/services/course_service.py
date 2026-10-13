import uuid

from fastapi import HTTPException
from sqlalchemy import any_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.badge import Badge
from app.models.category import Category
from app.models.course import Course
from app.models.module import Module, ModuleQuizQuestion
from app.models.skill import Skill
from app.models.user import User
from app.schemas.course import (
    CourseListItem, LearnerCourseOut, LearnerModuleOut, LearnerQuizQuestionOut,
    ModuleCreate, ModuleUpdate, MyCourseItem,
)


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
        ))
    return items


def _assigned_to(user: User) -> list:
    """SQL conditions meaning "this course is assigned to this user" — directly
    or through their team. The caller ORs them together."""
    conditions = [user.id == any_(Course.assigned_user_ids)]
    if user.team_id is not None:
        conditions.append(user.team_id == any_(Course.assigned_team_ids))
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
    return [
        MyCourseItem(
            id=course.id, title=course.title, category_id=course.category_id, category_name=category_name,
            duration_label=course.duration_label, module_count=module_count,
            assigned_team_count=len(course.assigned_team_ids or []),
            progress_pct=0,
        )
        for course, category_name, module_count in result.all()
    ]


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

    modules = [
        LearnerModuleOut(
            id=m.id, title=m.title, type=m.type, position=m.position, required=m.required, threshold=m.threshold,
            file_url=m.file_url, file_name=m.file_name, file_size_label=m.file_size_label,
            instructions=m.instructions, skill_count=len(m.skill_ids or []),
            questions=[LearnerQuizQuestionOut(id=q.id, text=q.text, options=list(q.options)) for q in (m.questions or [])],
            completed=False,
        )
        for m in course.modules
    ]
    return LearnerCourseOut(
        id=course.id, title=course.title, description=course.description,
        category_id=course.category_id, category_name=course.category.name if course.category else None,
        duration_label=course.duration_label, module_count=len(modules),
        assigned_team_count=len(course.assigned_team_ids or []),
        progress_pct=0, modules=modules, completed_module_count=0,
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

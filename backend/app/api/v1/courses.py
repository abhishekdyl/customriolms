import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.category import Category
from app.models.course import Course
from app.models.module import Module
from app.models.user import RoleName, User
from app.schemas.course import (
    CourseAssignRequest, CourseCreate, CourseListItem, CourseOut, CourseUpdate,
    LearnerCourseOut, ModuleCreate, ModuleOut, ModuleReorderRequest, ModuleUpdate, MyCourseItem,
)
from app.services.course_service import (
    add_module, assign_course, get_course_or_404, get_my_course, list_courses, list_my_courses, reorder_modules, update_module,
)

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])


@router.get("", response_model=list[CourseListItem])
async def get_courses(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # A learner only ever sees what's assigned to them — not the org's whole catalogue.
    if current_user.role == RoleName.LEARNER:
        return await list_my_courses(db, current_user)
    return await list_courses(db, current_user.org_id)


# Declared before "/{course_id}" on purpose — otherwise FastAPI would try to
# parse the word "mine" as a course UUID and return a 422.
@router.get("/mine", response_model=list[MyCourseItem])
async def get_my_courses(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Courses assigned to the logged-in user (via team or directly), with their progress."""
    return await list_my_courses(db, current_user)


@router.get("/mine/{course_id}", response_model=LearnerCourseOut)
async def get_my_course_detail(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Course view for the learner it's assigned to — modules and quiz questions, no answers."""
    return await get_my_course(db, course_id, current_user)


@router.post("", response_model=CourseOut, status_code=201, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def create_course(body: CourseCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if body.category_id:
        cat = await db.execute(select(Category).where(Category.id == body.category_id, Category.org_id == current_user.org_id))
        if cat.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Category not found in this organization")

    course = Course(org_id=current_user.org_id, title=body.title, category_id=body.category_id,
                     description=body.description, duration_label=body.duration_label)
    db.add(course)
    await db.commit()
    # Not db.refresh() — see course_service.get_course_or_404's note; a
    # plain refresh() doesn't reload relationships (modules, category),
    # and this response needs both. Re-fetching through the same helper
    # every other course endpoint uses also picks up category_name.
    return await get_course_or_404(db, course.id, current_user.org_id)


@router.get("/{course_id}", response_model=CourseOut)
async def get_course(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # The full authoring shape includes quiz answers — learners use /courses/mine/{id} instead.
    if current_user.role == RoleName.LEARNER:
        raise HTTPException(status_code=403, detail="Not allowed")
    return await get_course_or_404(db, course_id, current_user.org_id)


@router.patch("/{course_id}", response_model=CourseOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def update_course(course_id: uuid.UUID, body: CourseUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    for key, value in body.model_dump(exclude_unset=True).items():
        setattr(course, key, value)
    await db.commit()
    return await get_course_or_404(db, course_id, current_user.org_id)


@router.delete("/{course_id}", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def delete_course(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    await db.delete(course)  # cascades to modules and their questions
    await db.commit()


@router.post("/{course_id}/assign", response_model=CourseOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def assign(course_id: uuid.UUID, body: CourseAssignRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await assign_course(db, course, body.team_ids, body.user_ids)


# ---------- Modules — nested under their course, not a flat /api/v1/modules,
# so every module operation is naturally org-scoped through its parent ----------

@router.post("/{course_id}/modules", response_model=ModuleOut, status_code=201, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def create_module(course_id: uuid.UUID, body: ModuleCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await add_module(db, course, body)


@router.patch("/{course_id}/modules/{module_id}", response_model=ModuleOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def patch_module(course_id: uuid.UUID, module_id: uuid.UUID, body: ModuleUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_course_or_404(db, course_id, current_user.org_id)  # ownership check
    module = await _get_module_or_404(db, module_id, course_id)
    return await update_module(db, module, body, current_user.org_id)


@router.delete("/{course_id}/modules/{module_id}", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def delete_module(course_id: uuid.UUID, module_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_course_or_404(db, course_id, current_user.org_id)
    module = await _get_module_or_404(db, module_id, course_id)
    await db.delete(module)
    await db.commit()


@router.post("/{course_id}/modules/reorder", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def reorder(course_id: uuid.UUID, body: ModuleReorderRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    await reorder_modules(db, course, body.module_ids)


async def _get_module_or_404(db: AsyncSession, module_id: uuid.UUID, course_id: uuid.UUID) -> Module:
    result = await db.execute(select(Module).where(Module.id == module_id, Module.course_id == course_id))
    module = result.scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found on this course")
    return module

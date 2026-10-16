import mimetypes
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import Response
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_current_user_via_header_or_query, require_role
from app.core.database import get_db
from app.models.category import Category
from app.models.course import Course
from app.models.module import Module, ModuleType
from app.models.user import RoleName, User
from app.schemas.course import (
    CourseAssignRequest, CourseCreate, CourseListItem, CourseModuleProgressOut, CourseOut, CourseUpdate,
    EnrolledLearnerOut, LearnerCourseOut, ModuleCreate, ModuleOut, ModuleReorderRequest, ModuleUpdate, MyCourseItem,
    QuizAttemptOut,
)
from app.schemas.learn import CompleteRequest, CompleteResult, QuizResult, QuizSubmit
from app.services.course_service import (
    _assigned_to, add_module, assign_course, get_course_or_404, get_my_course, list_courses, list_enrolled,
    list_module_progress, list_my_courses, list_quiz_attempts, remove_module_content, reorder_modules, update_module,
    upload_module_content, upload_scorm_package,
)
from app.services import learn_service as progress_svc
from app.services import storage_service

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


async def _module_belongs_to_course(module_id: uuid.UUID, course_id: uuid.UUID, db: AsyncSession) -> None:
    row = (await db.execute(select(Module.id).where(Module.id == module_id, Module.course_id == course_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Module not found on this course")


@router.post("/mine/{course_id}/modules/{module_id}/complete", response_model=CompleteResult)
async def complete_my_module(
    course_id: uuid.UUID, module_id: uuid.UUID, body: CompleteRequest | None = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Marks a non-quiz module done for the caller. 404s if the module isn't
    on this course, or the course isn't assigned to them (checked inside
    complete_module via assigned_courses). body.watched_pct only matters
    for a WATCH module — see complete_module's docstring."""
    await _module_belongs_to_course(module_id, course_id, db)
    pct, completed, code, video_question_results = await progress_svc.complete_module(
        db, current_user, module_id, (body.watched_pct if body else None), (body.answers if body else None),
    )
    return CompleteResult(progress=pct, course_completed=completed, certificate_code=code,
                           video_question_results=video_question_results)


@router.post("/mine/{course_id}/modules/{module_id}/quiz", response_model=QuizResult)
async def submit_my_quiz(
    course_id: uuid.UUID, module_id: uuid.UUID, body: QuizSubmit,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Scores a quiz module's answers server-side and records the attempt."""
    await _module_belongs_to_course(module_id, course_id, db)
    result = await progress_svc.submit_quiz(db, current_user, module_id, body.answers)
    return result


@router.post("", response_model=CourseOut, status_code=201, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def create_course(body: CourseCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if body.category_id:
        cat = await db.execute(select(Category).where(Category.id == body.category_id, Category.org_id == current_user.org_id))
        if cat.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Category not found in this organization")
    if body.opens_at and body.closes_at and body.closes_at <= body.opens_at:
        raise HTTPException(status_code=400, detail="Close date must be after the open date")

    course = Course(org_id=current_user.org_id, title=body.title, category_id=body.category_id,
                     description=body.description, duration_label=body.duration_label,
                     opens_at=body.opens_at, closes_at=body.closes_at)
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
    data = body.model_dump(exclude_unset=True)
    if "completion_module_ids" in data:
        ids = data["completion_module_ids"] or []
        # completion_module_ids isn't a real FK array (see Course model's
        # note) — check every id belongs to THIS course explicitly, the
        # same way module/badge/skill ids get validated elsewhere.
        valid_ids = {m.id for m in course.modules}
        if any(i not in valid_ids for i in ids):
            raise HTTPException(status_code=400, detail="One or more of those modules aren't on this course")
        data["completion_module_ids"] = ids
    for key, value in data.items():
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


@router.get(
    "/{course_id}/enrolled", response_model=list[EnrolledLearnerOut],
    dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))],
)
async def get_enrolled(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Who's actually enrolled — team + individual assignment resolved into
    real learners, each with their own progress. A Team Lead only sees
    their own team's members (enforced in list_enrolled)."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await list_enrolled(db, course, current_user)


@router.get(
    "/{course_id}/module-progress", response_model=CourseModuleProgressOut,
    dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))],
)
async def get_module_progress(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The module-by-module completion matrix — every enrolled learner as a
    row, every module on the course as a column, so an admin can see
    exactly which modules each learner has (and hasn't) cleared, not just
    their rolled-up course %. A Team Lead only sees their own team."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await list_module_progress(db, course, current_user)


@router.get(
    "/{course_id}/quiz-attempts", response_model=list[QuizAttemptOut],
    dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))],
)
async def get_quiz_attempts(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every submission of every quiz module on this course, pass or fail,
    with exactly what each learner answered — a quiz always records an
    attempt whether it's right or wrong, so this is how an admin reviews
    what actually happened rather than only the pass/fail gate a learner
    sees. A Team Lead only sees their own team's members."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await list_quiz_attempts(db, course, current_user)


# ---------- Modules — nested under their course, not a flat /api/v1/modules,
# so every module operation is naturally org-scoped through its parent ----------

@router.post("/{course_id}/modules", response_model=ModuleOut, status_code=201, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def create_module(course_id: uuid.UUID, body: ModuleCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await add_module(db, course, body)


@router.patch("/{course_id}/modules/{module_id}", response_model=ModuleOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def patch_module(course_id: uuid.UUID, module_id: uuid.UUID, body: ModuleUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)  # also doubles as the ownership check
    module = await _get_module_or_404(db, module_id, course_id)
    if body.restrictions is not None:
        other_ids = {m.id for m in course.modules if m.id != module_id}
        for r in body.restrictions:
            if r.type == "module_score" and r.module_id not in other_ids:
                raise HTTPException(status_code=400, detail="That module_score restriction references a module that isn't on this course")
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


@router.post("/{course_id}/modules/{module_id}/upload", response_model=ModuleOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def upload_module_file(
    course_id: uuid.UUID, module_id: uuid.UUID, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Real file upload for a WATCH (video) or READ (PDF/DOC/PPT) module —
    stored in object storage (R2 in production), validated by type/size
    for the module's kind. Replaces any file the module already had."""
    await get_course_or_404(db, course_id, current_user.org_id)
    module = await _get_module_or_404(db, module_id, course_id)
    if module.type.value not in ("watch", "read"):
        raise HTTPException(status_code=400, detail="This module type doesn't accept a file upload")
    return await upload_module_content(db, module, file, current_user.org_id, current_user)


@router.delete("/{course_id}/modules/{module_id}/file", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def delete_module_file(
    course_id: uuid.UUID, module_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    await get_course_or_404(db, course_id, current_user.org_id)
    module = await _get_module_or_404(db, module_id, course_id)
    await remove_module_content(db, module)


@router.post("/{course_id}/modules/{module_id}/scorm-upload", response_model=ModuleOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def upload_scorm(
    course_id: uuid.UUID, module_id: uuid.UUID, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Unpacks a SCORM 1.2/2004 .zip and points the module at its launch
    file — see scorm_service.parse_zip for the manifest parsing."""
    await get_course_or_404(db, course_id, current_user.org_id)
    module = await _get_module_or_404(db, module_id, course_id)
    if module.type != ModuleType.SCORM:
        raise HTTPException(status_code=400, detail="This module isn't a SCORM module")
    return await upload_scorm_package(db, module, file, current_user.org_id, current_user)


@router.get("/{course_id}/modules/{module_id}/scorm-content/{file_path:path}")
async def get_scorm_content(
    course_id: uuid.UUID, module_id: uuid.UUID, file_path: str,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user_via_header_or_query),
):
    """Streams one file out of a module's unpacked SCORM package. Loaded as
    a plain browser navigation (the player's <iframe src=...>, and every
    relative asset request the package's own JS/HTML makes from inside
    it), so auth comes via get_current_user_via_header_or_query rather
    than the usual header-only dependency — see that function's note."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    module = await _get_module_or_404(db, module_id, course_id)
    if module.type != ModuleType.SCORM or not module.file_key:
        raise HTTPException(status_code=404, detail="No SCORM package on this module")

    # Org Admin / Team Lead can always preview; a Learner only if this
    # course is actually assigned to them (same rule get_my_course uses).
    if current_user.role == RoleName.LEARNER:
        result = await db.execute(select(Course.id).where(Course.id == course_id, or_(*_assigned_to(current_user))))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Course not found")
        # Same lock gate as get_my_course's stripped file_url — a learner
        # who already has (or guesses) the content URL from a prior
        # unlocked state can't keep hitting it after a course gets locked
        # out from under them, or by typing the path directly.
        done = await progress_svc.completed_map(db, current_user.id)
        locked, reason = progress_svc.module_locked(course, module, done, current_user)
        if locked:
            raise HTTPException(status_code=403, detail=reason or "This module is locked.")

    # Each file inside the package is its own `files` row, keyed by its
    # relative path within the zip (see course_service.upload_scorm_package)
    # — module.file_key is just a "content exists" marker now, not a
    # concatenable object-storage prefix.
    record = await storage_service.find_file(db, component="mod_scorm", filearea="package", itemid=module.id, filepath=file_path)
    if record is None:
        raise HTTPException(status_code=404, detail="File not found in this package")
    data = storage_service.get_bytes(storage_service.file_key(record))
    if data is None:
        raise HTTPException(status_code=404, detail="File not found in this package")
    content_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    return Response(content=data, media_type=content_type)


async def _get_module_or_404(db: AsyncSession, module_id: uuid.UUID, course_id: uuid.UUID) -> Module:
    result = await db.execute(select(Module).where(Module.id == module_id, Module.course_id == course_id))
    module = result.scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found on this course")
    return module

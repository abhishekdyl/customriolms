import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_capability
from app.core.database import get_db
from app.models.course import Course
from app.models.module import Module
from app.models.org import Org
from app.models.point_rule import PointEvent, PointRule
from app.models.user import User
from app.schemas.learn import LeaderRow
from app.schemas.point_rule import CoursePointsOut, ModulePointsOut, PointsUpdate
from app.services import learn_service

router = APIRouter(prefix="/api/v1/point-rules", tags=["point-rules"])

# Recognition page's Leaderboard tab, "Points settings" section — set once
# here and nothing else in this file needs it, since every endpoint below
# both reads and writes an org's own point rules.
manage_only = [Depends(require_capability("leaderboard.manage"))]


@router.get("/leaderboard", response_model=list[LeaderRow])
async def admin_leaderboard(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The same ranking as the learner-facing GET /learn/leaderboard, just
    reachable by an Org Admin/Team Lead too (that router is LEARNER-only)
    — this is what the Recognition page's Leaderboard tab actually shows,
    rather than the placeholder zero-points list it used to render."""
    return await learn_service.leaderboard(db, current_user)


@router.get("/courses", response_model=list[CoursePointsOut], dependencies=manage_only)
async def list_course_points(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every course in this org with the points its certificate is
    currently worth — the org's default_course_points unless this
    specific course has its own PointRule override."""
    courses = (await db.execute(select(Course).where(Course.org_id == current_user.org_id).order_by(Course.title))).scalars().all()
    rules = (await db.execute(
        select(PointRule).where(PointRule.org_id == current_user.org_id, PointRule.event == PointEvent.COURSE_COMPLETE)
    )).scalars().all()
    overrides = {r.course_id: r.points for r in rules}
    org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()
    return [
        CoursePointsOut(
            course_id=c.id, title=c.title,
            points=overrides.get(c.id, org.default_course_points),
            is_override=c.id in overrides,
        )
        for c in courses
    ]


@router.put("/courses/{course_id}", response_model=CoursePointsOut, dependencies=manage_only)
async def set_course_points(course_id: uuid.UUID, body: PointsUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = (await db.execute(select(Course).where(Course.id == course_id, Course.org_id == current_user.org_id))).scalar_one_or_none()
    if course is None:
        raise HTTPException(status_code=404, detail="Course not found")

    rule = (await db.execute(
        select(PointRule).where(PointRule.course_id == course_id, PointRule.event == PointEvent.COURSE_COMPLETE)
    )).scalar_one_or_none()
    if body.points is None:
        # Clear the override — revert to the org's own default.
        if rule is not None:
            await db.delete(rule)
            await db.commit()
    else:
        if rule is None:
            db.add(PointRule(org_id=current_user.org_id, event=PointEvent.COURSE_COMPLETE, course_id=course_id, points=body.points))
        else:
            rule.points = body.points
        await db.commit()

    org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()
    final_rule = (await db.execute(
        select(PointRule).where(PointRule.course_id == course_id, PointRule.event == PointEvent.COURSE_COMPLETE)
    )).scalar_one_or_none()
    return CoursePointsOut(
        course_id=course.id, title=course.title,
        points=final_rule.points if final_rule else org.default_course_points,
        is_override=final_rule is not None,
    )


@router.get("/modules", response_model=list[ModulePointsOut], dependencies=manage_only)
async def list_module_points(course_id: uuid.UUID | None = None, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every module in this org (optionally filtered to one course) with
    the points completing it is currently worth — the org's
    default_module_points unless this specific module has its own
    PointRule override. Works for any ModuleType, including SCORM."""
    query = select(Module, Course.org_id).join(Course, Course.id == Module.course_id).where(Course.org_id == current_user.org_id)
    if course_id is not None:
        query = query.where(Module.course_id == course_id)
    rows = (await db.execute(query.order_by(Module.course_id, Module.position))).all()
    rules = (await db.execute(
        select(PointRule).where(PointRule.org_id == current_user.org_id, PointRule.event == PointEvent.MODULE_COMPLETE)
    )).scalars().all()
    overrides = {r.module_id: r.points for r in rules}
    org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()
    return [
        ModulePointsOut(
            module_id=m.id, course_id=m.course_id, title=m.title, type=m.type.value,
            points=overrides.get(m.id, org.default_module_points),
            is_override=m.id in overrides,
        )
        for m, _ in rows
    ]


@router.put("/modules/{module_id}", response_model=ModulePointsOut, dependencies=manage_only)
async def set_module_points(module_id: uuid.UUID, body: PointsUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    module = (await db.execute(
        select(Module).join(Course, Course.id == Module.course_id).where(Module.id == module_id, Course.org_id == current_user.org_id)
    )).scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found")

    rule = (await db.execute(
        select(PointRule).where(PointRule.module_id == module_id, PointRule.event == PointEvent.MODULE_COMPLETE)
    )).scalar_one_or_none()
    if body.points is None:
        if rule is not None:
            await db.delete(rule)
            await db.commit()
    else:
        if rule is None:
            db.add(PointRule(org_id=current_user.org_id, event=PointEvent.MODULE_COMPLETE, module_id=module_id, points=body.points))
        else:
            rule.points = body.points
        await db.commit()

    org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()
    final_rule = (await db.execute(
        select(PointRule).where(PointRule.module_id == module_id, PointRule.event == PointEvent.MODULE_COMPLETE)
    )).scalar_one_or_none()
    return ModulePointsOut(
        module_id=module.id, course_id=module.course_id, title=module.title, type=module.type.value,
        points=final_rule.points if final_rule else org.default_module_points,
        is_override=final_rule is not None,
    )

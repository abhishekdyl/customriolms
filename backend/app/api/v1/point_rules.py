import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_capability
from app.core.database import get_db
from app.models.course import Course
from app.models.module import Module, ModuleType
from app.models.point_rule import PointRule, RuleEvent, RuleScope
from app.models.user import User
from app.schemas.learn import LeaderRow
from app.schemas.point_rule import PointRuleCreate, PointRuleOut
from app.services import learn_service

router = APIRouter(prefix="/api/v1/point-rules", tags=["point-rules"])

# Recognition page's Leaderboard tab, "Points settings" section — every
# endpoint below both reads and writes an org's own point rules.
manage_only = [Depends(require_capability("leaderboard.manage"))]

# Only these module types persist an "in progress, not finished yet" row
# (WatchProgress/ScormProgress) to key a START event off — see
# learn_service.points_by_user's docstring for why. Enforced here so a
# rule that could never fire is never saved in the first place.
START_CAPABLE_TYPES = {ModuleType.WATCH, ModuleType.SCORM}


@router.get("/leaderboard", response_model=list[LeaderRow])
async def admin_leaderboard(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The same ranking as the learner-facing GET /learn/leaderboard, just
    reachable by an Org Admin/Team Lead too (that router is LEARNER-only)
    — this is what the Recognition page's Leaderboard tab shows."""
    return await learn_service.leaderboard(db, current_user)


@router.get("", response_model=list[PointRuleOut], dependencies=manage_only)
async def list_rules(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rules = (await db.execute(select(PointRule).where(PointRule.org_id == current_user.org_id))).scalars().all()
    courses = {c.id: c.title for c in (await db.execute(select(Course).where(Course.org_id == current_user.org_id))).scalars().all()}
    modules = {
        m.id: m for m, _ in (await db.execute(
            select(Module, Course.org_id).join(Course, Course.id == Module.course_id).where(Course.org_id == current_user.org_id)
        )).all()
    }

    out: list[PointRuleOut] = []
    for r in rules:
        if r.scope == RuleScope.COURSE:
            out.append(PointRuleOut(
                id=r.id, scope=r.scope, event=r.event, points=r.points,
                course_id=r.course_id, course_title=courses.get(r.course_id, "(deleted course)"),
            ))
        else:
            m = modules.get(r.module_id)
            if m is None:
                continue  # module was deleted — orphaned rule, hide it rather than 500
            out.append(PointRuleOut(
                id=r.id, scope=r.scope, event=r.event, points=r.points,
                course_id=m.course_id, course_title=courses.get(m.course_id, "(deleted course)"),
                module_id=m.id, module_title=m.title, module_type=m.type.value,
            ))
    return out


@router.post("", response_model=PointRuleOut, dependencies=manage_only)
async def upsert_rule(body: PointRuleCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    module: Module | None = None
    if body.scope == RuleScope.COURSE:
        course = (await db.execute(select(Course).where(Course.id == body.course_id, Course.org_id == current_user.org_id))).scalar_one_or_none()
        if course is None:
            raise HTTPException(status_code=404, detail="Course not found")
        existing = (await db.execute(
            select(PointRule).where(PointRule.course_id == body.course_id, PointRule.event == body.event)
        )).scalar_one_or_none()
    else:
        module = (await db.execute(
            select(Module).join(Course, Course.id == Module.course_id).where(Module.id == body.module_id, Course.org_id == current_user.org_id)
        )).scalar_one_or_none()
        if module is None:
            raise HTTPException(status_code=404, detail="Module not found")
        if body.event == RuleEvent.START and module.type not in START_CAPABLE_TYPES:
            raise HTTPException(status_code=400, detail=f"A {module.type.value} activity has no 'start' event to award points for — only video/SCORM do")
        existing = (await db.execute(
            select(PointRule).where(PointRule.module_id == body.module_id, PointRule.event == body.event)
        )).scalar_one_or_none()

    if existing is not None:
        existing.points = body.points
        rule = existing
    else:
        rule = PointRule(org_id=current_user.org_id, scope=body.scope, event=body.event, course_id=body.course_id, module_id=body.module_id, points=body.points)
        db.add(rule)
    await db.commit()
    await db.refresh(rule)

    if body.scope == RuleScope.COURSE:
        return PointRuleOut(id=rule.id, scope=rule.scope, event=rule.event, points=rule.points, course_id=course.id, course_title=course.title)
    return PointRuleOut(
        id=rule.id, scope=rule.scope, event=rule.event, points=rule.points,
        course_id=module.course_id, course_title=(await db.execute(select(Course.title).where(Course.id == module.course_id))).scalar_one(),
        module_id=module.id, module_title=module.title, module_type=module.type.value,
    )


@router.delete("/{rule_id}", status_code=204, dependencies=manage_only)
async def delete_rule(rule_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rule = (await db.execute(select(PointRule).where(PointRule.id == rule_id, PointRule.org_id == current_user.org_id))).scalar_one_or_none()
    if rule is None:
        raise HTTPException(status_code=404, detail="Rule not found")
    await db.delete(rule)
    await db.commit()

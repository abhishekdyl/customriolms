"""Real aggregate numbers for the Org Admin / Team Lead dashboards.

Everything here is derived from ModuleProgress — the same source of
truth learn_service.py uses for a single learner's own progress — just
rolled up per-user and per-team. No due-date concept exists anywhere
in Course/assignment (nothing records when a course was assigned or
when it's due), so "overdue" can't be computed honestly; dashboards
use "not started" (an assigned course with 0% progress) as the nearest
real, defensible proxy instead of fabricating a number. Likewise there
is no historical snapshot table, so month-over-month trend arrows
aren't computable yet — dashboards should omit them rather than fake
them.
"""
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.course import Course
from app.models.module import Module, ModuleType
from app.models.skill import Skill
from app.models.user import RoleName, User, UserStatus
from app.services import learn_service as progress_svc


async def _learners(db: AsyncSession, org_id: uuid.UUID) -> list[User]:
    rows = await db.execute(
        select(User).where(
            User.org_id == org_id, User.role == RoleName.LEARNER,
            User.status.in_([UserStatus.ACTIVE, UserStatus.INVITED]),
        )
    )
    return list(rows.scalars().all())


async def learner_progress_map(db: AsyncSession, org_id: uuid.UUID) -> dict[uuid.UUID, dict]:
    """{user_id: {progress_pct, assigned_count, not_started_count}} for every
    active/invited learner in the org — their own average progress across
    whatever courses are assigned to them, same per-course math as
    course_service.list_my_courses, just computed for everyone at once
    instead of one caller."""
    learners = await _learners(db, org_id)
    courses = (await db.execute(select(Course).where(Course.org_id == org_id))).scalars().all()

    out: dict[uuid.UUID, dict] = {}
    for learner in learners:
        assigned = [
            c for c in courses
            if learner.id in (c.assigned_user_ids or [])
            or (learner.team_id is not None and learner.team_id in (c.assigned_team_ids or []))
        ]
        if not assigned:
            out[learner.id] = {"progress_pct": 0, "assigned_count": 0, "not_started_count": 0}
            continue
        done = await progress_svc.completed_map(db, learner.id)
        pcts = [progress_svc.course_progress(c, done)[0] for c in assigned]
        out[learner.id] = {
            "progress_pct": round(sum(pcts) / len(pcts)),
            "assigned_count": len(assigned),
            "not_started_count": sum(1 for p in pcts if p == 0),
        }
    return out


async def team_skill_coverage(db: AsyncSession, org_id: uuid.UUID) -> dict[uuid.UUID, dict[uuid.UUID, int]]:
    """{team_id: {skill_id: avg_pct}} — average, across every member of the
    team, of how "built" each skill is: 0 if a tagged module isn't done,
    the quiz score if it is a done quiz module, 100 for any other done
    module. Same per-learner formula as learn_service.build_progress's
    skill radar, just averaged across a team instead of shown for one
    learner."""
    learners = await _learners(db, org_id)
    if not learners:
        return {}
    courses = (await db.execute(select(Course).where(Course.org_id == org_id))).scalars().all()
    skills = (await db.execute(select(Skill).where(Skill.org_id == org_id))).scalars().all()
    if not skills:
        return {}

    by_team: dict[uuid.UUID, list[User]] = {}
    for learner in learners:
        if learner.team_id is not None:
            by_team.setdefault(learner.team_id, []).append(learner)

    out: dict[uuid.UUID, dict[uuid.UUID, int]] = {}
    for team_id, members in by_team.items():
        skill_values: dict[uuid.UUID, list[int]] = {s.id: [] for s in skills}
        for member in members:
            assigned = [
                c for c in courses
                if member.id in (c.assigned_user_ids or []) or member.team_id in (c.assigned_team_ids or [])
            ]
            done = await progress_svc.completed_map(db, member.id)
            for s in skills:
                vals = []
                for c in assigned:
                    for m in c.modules:
                        if s.id in (m.skill_ids or []):
                            mp = done.get(m.id)
                            if mp is None:
                                vals.append(0)
                            elif m.type == ModuleType.QUIZ and mp.score is not None:
                                vals.append(mp.score)
                            else:
                                vals.append(100)
                if vals:
                    skill_values[s.id].append(round(sum(vals) / len(vals)))
        out[team_id] = {
            sid: (round(sum(vals) / len(vals)) if vals else 0) for sid, vals in skill_values.items()
        }
    return out

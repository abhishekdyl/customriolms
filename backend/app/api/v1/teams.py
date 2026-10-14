import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.team import Team
from app.models.user import RoleName, User
from app.schemas.team import TeamCreate, TeamOut, TeamSkillCoverage, TeamUpdate
from app.services import dashboard_service

router = APIRouter(prefix="/api/v1/teams", tags=["teams"])


@router.get(
    "/skill-coverage", response_model=list[TeamSkillCoverage],
    dependencies=[Depends(require_role(RoleName.ORG_ADMIN))],
)
async def get_skill_coverage(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Average %-built per skill, per team — backs the Org Admin dashboard's
    skill-coverage heatmap. Declared before "/{team_id}" routes so FastAPI
    doesn't try to parse "skill-coverage" as a team id."""
    coverage = await dashboard_service.team_skill_coverage(db, current_user.org_id)
    return [TeamSkillCoverage(team_id=tid, scores=scores) for tid, scores in coverage.items()]


@router.get("", response_model=list[TeamOut], dependencies=[Depends(require_role(RoleName.ORG_ADMIN, RoleName.TEAM_LEAD))])
async def list_teams(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """
    Every list endpoint filters by org_id from the authenticated user's
    token — never from a query param the client could tamper with.
    """
    result = await db.execute(
        select(Team, func.count(User.id).label("member_count"))
        .outerjoin(User, User.team_id == Team.id)
        .where(Team.org_id == current_user.org_id)
        .group_by(Team.id)
    )
    return [TeamOut(id=t.id, name=t.name, member_count=count) for t, count in result.all()]


@router.post("", response_model=TeamOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def create_team(body: TeamCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = Team(org_id=current_user.org_id, name=body.name)
    db.add(team)
    await db.commit()
    await db.refresh(team)
    return TeamOut(id=team.id, name=team.name, member_count=0)


@router.patch("/{team_id}", response_model=TeamOut, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def rename_team(team_id: uuid.UUID, body: TeamUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = await _get_team_or_404(db, team_id, current_user.org_id)
    team.name = body.name
    await db.commit()
    return TeamOut(id=team.id, name=team.name)


@router.delete("/{team_id}", status_code=204, dependencies=[Depends(require_role(RoleName.ORG_ADMIN))])
async def delete_team(team_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    team = await _get_team_or_404(db, team_id, current_user.org_id)
    # Members are NOT cascade-deleted — they become unassigned (team_id=null),
    # matching the "Uncategorized" pattern used for course categories. A
    # team disappearing should never silently delete people's accounts.
    result = await db.execute(select(User).where(User.team_id == team_id))
    for user in result.scalars().all():
        user.team_id = None
    await db.delete(team)
    await db.commit()


async def _get_team_or_404(db: AsyncSession, team_id: uuid.UUID, org_id: uuid.UUID) -> Team:
    result = await db.execute(select(Team).where(Team.id == team_id, Team.org_id == org_id))
    team = result.scalar_one_or_none()
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    return team

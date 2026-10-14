import uuid

from pydantic import BaseModel


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str


class TeamOut(BaseModel):
    id: uuid.UUID
    name: str
    member_count: int = 0  # populated by the service layer, not a DB column

    class Config:
        from_attributes = True


class TeamSkillCoverage(BaseModel):
    """One team's average %-built per skill — see
    dashboard_service.team_skill_coverage."""
    team_id: uuid.UUID
    scores: dict[uuid.UUID, int]  # skill_id -> avg pct across the team's members

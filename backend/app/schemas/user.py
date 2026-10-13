import uuid

from pydantic import BaseModel, EmailStr

from app.models.user import RoleName, UserStatus


class InviteUserRequest(BaseModel):
    email: EmailStr
    team_id: uuid.UUID | None = None
    role: RoleName = RoleName.LEARNER


class BulkInviteRow(BaseModel):
    """One row of an uploaded CSV — name/email/team columns, validated before any DB write."""
    name: str
    email: EmailStr
    team_name: str
    role: RoleName = RoleName.LEARNER


class BulkInviteResult(BaseModel):
    invited: int
    skipped: list[str]  # emails that already existed — never silently overwritten
    domain_rejected: list[str] = []  # emails outside the org's allowed_domains, if any is set
    seat_limited: list[str] = []  # rows never even attempted because the org ran out of seats partway through


class UpdateRoleRequest(BaseModel):
    role: RoleName


class UpdateTeamRequest(BaseModel):
    team_id: uuid.UUID | None  # null moves the user to "no team"


class UpdateUserStatusRequest(BaseModel):
    """Suspend/reactivate — distinct from DELETE (which deactivates,
    a one-way soft delete). Only ACTIVE and SUSPENDED are valid targets
    here; INVITED/DEACTIVATED are set by other flows, not this one."""
    status: UserStatus


class AcceptInviteRequest(BaseModel):
    token: str
    password: str


class UserOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: RoleName
    status: UserStatus
    team_id: uuid.UUID | None
    team_name: str | None = None  # filled in by the endpoint via a join, not stored on the row

    class Config:
        from_attributes = True

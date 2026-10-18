import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models.user import RoleName, UserStatus

# The three fields an Org Admin's user-edit form treats as mandatory —
# same trio collected when a user is first created (single invite or
# bulk CSV). Role is restricted to the roles an Org Admin can actually
# hand out from that form (see roleOptions in users/page.tsx) — SUPER_ADMIN
# is platform staff and is never grantable through this endpoint, even by
# an Org Admin who edits the request directly.
_ASSIGNABLE_ROLES = (RoleName.ORG_ADMIN, RoleName.TEAM_LEAD, RoleName.LEARNER)


class InviteUserRequest(BaseModel):
    email: EmailStr
    team_id: uuid.UUID | None = None
    role: RoleName = RoleName.LEARNER
    # Optional only for backward compatibility with any existing caller that
    # doesn't send it — the UI always sends it now. Falls back to the email
    # prefix (see invite_user) when omitted or blank.
    name: str | None = None


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


class AdminUpdateUserRequest(BaseModel):
    """The full "view/edit profile" form an Org Admin uses on someone
    else's account. name/email/role are mandatory — the same trio
    required when the user was first created — everything else is an
    optional extra that's simply left alone when omitted."""
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    role: RoleName
    team_id: uuid.UUID | None = None
    phone: str | None = Field(default=None, max_length=30)
    job_title: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=500)
    country: str | None = Field(default=None, max_length=100)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name can't be empty")
        return v

    @field_validator("role")
    @classmethod
    def _assignable_role(cls, v: RoleName) -> RoleName:
        if v not in _ASSIGNABLE_ROLES:
            raise ValueError(f"role must be one of {', '.join(r.value for r in _ASSIGNABLE_ROLES)}")
        return v


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
    firstname: str
    lastname: str
    full_name: str
    username: str
    email: str
    role: RoleName
    status: UserStatus
    team_id: uuid.UUID | None
    team_name: str | None = None  # filled in by the endpoint via a join, not stored on the row
    city: str | None = None
    country: str | None = None
    timezone: str | None = None
    companyname: str | None = None
    phone: str | None = None
    job_title: str | None = None
    location: str | None = None
    bio: str | None = None

    class Config:
        from_attributes = True


class LearnerProgressOut(BaseModel):
    """One learner's rolled-up progress, for the Org Admin / Team Lead
    dashboards — see dashboard_service.learner_progress_map."""
    user_id: uuid.UUID
    progress_pct: int
    assigned_count: int
    not_started_count: int

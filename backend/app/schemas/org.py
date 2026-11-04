import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field

from app.models.org import OrgPlan, OrgStatus


class OrgOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan: OrgPlan
    status: OrgStatus
    user_limit: int
    allowed_domains: list[str] = []
    created_at: datetime
    industry: str | None = None
    timezone: str = "UTC"
    contact_email: str | None = None
    logo_url: str | None = None
    allow_custom_username: bool = False
    user_count: int = 0  # filled in by the endpoint, not stored on the row
    # This org's (first) Org Admin — filled in by the endpoint, not stored
    # on the row. See list_orgs' docstring for why "first" rather than
    # "the" admin. admin_id is what OrgAdminUpdateRequest below targets.
    admin_id: uuid.UUID | None = None
    admin_name: str | None = None
    admin_email: str | None = None

    class Config:
        from_attributes = True


class OrgCreateRequest(BaseModel):
    """
    Super admin creating a new customer org from the platform side —
    distinct from POST /auth/register, which is a customer signing
    themselves up. This one also creates that org's first Org Admin.
    """
    org_name: str = Field(min_length=2, max_length=200)
    plan: OrgPlan = OrgPlan.STARTER
    admin_name: str = Field(min_length=1, max_length=200)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8)


class OrgUpdateStatusRequest(BaseModel):
    status: OrgStatus


class OrgUpdateRequest(BaseModel):
    """Edit an existing org's own details — separate from status, which
    has its own endpoint (and its own side effect of kicking every active
    session) and shouldn't be silently changeable via a generic PATCH."""
    name: str | None = Field(default=None, min_length=2, max_length=200)
    plan: OrgPlan | None = None
    user_limit: int | None = Field(default=None, ge=1)
    allowed_domains: list[str] | None = None


class OrgAdminUpdateRequest(BaseModel):
    """Super Admin editing this org's (first) Org Admin from the
    Organizations page — a customer's own Org Admin can't reach their own
    account through /users/{id}/profile (self-edit is blocked there) and
    a Super Admin can't reach it either (that endpoint only looks within
    the caller's own org, which for platform staff is the internal
    platform org, not this customer's). This is that missing path,
    scoped to exactly one target: whichever user GET /orgs resolved as
    this org's admin_id. Every field is optional and left alone when
    omitted; password resets must_change_password so the admin is forced
    to pick their own on next login, same as a fresh invite."""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)


class OrgProfileUpdateRequest(BaseModel):
    """The Org Settings page's own self-service edit — an Org Admin's org,
    not the platform's. Deliberately a different, smaller field set than
    OrgUpdateRequest above: no plan, user_limit, or allowed_domains here —
    those stay Super-Admin-only, changed from the Organizations page, not
    from inside the org itself."""
    name: str | None = Field(default=None, min_length=2, max_length=200)
    slug: str | None = Field(default=None, min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    industry: str | None = None
    timezone: str | None = None
    contact_email: EmailStr | None = None
    allow_custom_username: bool | None = None


class PlatformSettingsOut(BaseModel):
    allow_self_serve_signup: bool

    class Config:
        from_attributes = True


class PlatformSettingsUpdateRequest(BaseModel):
    allow_self_serve_signup: bool


class SuperAdminOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str

    class Config:
        from_attributes = True

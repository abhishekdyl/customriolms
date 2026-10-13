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
    user_count: int = 0  # filled in by the endpoint, not stored on the row
    admin_email: str | None = None  # this org's Org Admin — filled in by the endpoint, not stored on the row

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


class PlatformSettingsOut(BaseModel):
    allow_self_serve_signup: bool

    class Config:
        from_attributes = True


class PlatformSettingsUpdateRequest(BaseModel):
    allow_self_serve_signup: bool


class SuperAdminOut(BaseModel):
    id: uuid.UUID
    name: str
    email: str

    class Config:
        from_attributes = True

import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    """The registration page's "create a brand-new org" tab. city/
    country/pincode are required (shown with a red asterisk on the
    form, same convention as org_name/name/email/password); location and
    gstin are optional, same as on Org Settings afterward. All five are
    billing/invoice fields — stored directly on the new Org row (see
    register()) so "Billed to" on the very first subscription invoice
    already has a real address instead of needing an Org Admin to visit
    Org Settings first. confirm_password is deliberately NOT here — it's
    a frontend-only check (see UserRegisterForm's own confirmPassword
    for the existing precedent), never sent to the backend."""
    org_name: str = Field(min_length=1, max_length=200)
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8)
    city: str = Field(min_length=1, max_length=100)
    location: str | None = Field(default=None, max_length=120)
    country: str = Field(min_length=1, max_length=100)
    pincode: str = Field(min_length=1, max_length=20)
    gstin: str | None = Field(default=None, max_length=20)


class UserRegisterRequest(BaseModel):
    """The public "join an existing org" registration form — the
    toggle's second tab, next to the org-registration form above. Unlike
    RegisterRequest, this never creates an Org; org_slug must name one
    that already exists (see auth.register_user). The account it creates
    starts status=INVITED (pending an Org Admin's approval, not an admin
    sent them an invite link — see register_user's docstring), role
    always LEARNER.

    phone/job_title/location/country/city mirror User's own optional
    profile columns (see models/user.py) — kept here because they're
    genuinely used elsewhere: job_title can gate module access
    (course.py's profile_field restriction), and it's shown (along with
    bio, which this form doesn't collect) to an Org Admin/Team Lead in
    the user-profile dialog. companyname, bio and timezone were
    deliberately left off this form — companyname because nothing in
    the app besides the learner's own profile page ever reads it back;
    bio and timezone because the form was trimmed down to only the
    fields an Org Admin is likely to actually act on at a glance. All
    three are still settable from the learner's own profile page after
    approval, for anyone who wants them. country is validated against
    this platform's configured list — see ALL_COUNTRIES/allowed_countries.

    custom_fields is org_slug-dependent — only meaningful once an org's
    been picked, since each org defines its own set (see orgs.py's
    lookup_org, which returns the definitions this dict's keys must
    match). Unknown shortnames are silently ignored, same as
    ProfileFieldValuesUpdate elsewhere."""
    org_slug: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    password: str = Field(min_length=8)
    phone: str | None = Field(default=None, max_length=30)
    job_title: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    city: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    custom_fields: dict[str, str | None] = {}

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        return " ".join(v.split())  # trim + collapse stray whitespace


class LoginRequest(BaseModel):
    # Historically always an email; now the login *identifier* — matched
    # against both User.email and User.username (see auth.login), so it's
    # plain str rather than EmailStr (a custom username need not look like
    # an email address). Field name kept as `email` so no existing caller
    # (including the frontend login form) needs to change.
    email: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    must_change_password: bool = False
    # Lets the frontend send each role to its own home right after login
    # without a second /auth/me round trip.
    role: str | None = None
    # The URL prefix every org-scoped page lives under (e.g. "tech-learning"
    # for /tech-learning/users) — see the [org] route segment. Always null
    # for Super Admin, who isn't a member of any customer org.
    org_slug: str | None = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class GoogleLoginRequest(BaseModel):
    # The ID token (a signed JWT) from Google Identity Services' One Tap /
    # Sign-In button on the frontend — never a raw access token or an
    # email/password the frontend read out of the Google account itself.
    # Verified server-side against Google's own public keys in
    # auth.google_login before anything in it is trusted.
    credential: str


class GoogleRegisterRequest(GoogleLoginRequest):
    # Google has no concept of "organization name" — still has to come
    # from the person, same as the plain /auth/register form.
    org_name: str


class UserOut(BaseModel):
    id: uuid.UUID
    firstname: str
    lastname: str
    full_name: str
    username: str
    email: str
    role: str
    custom_role_id: uuid.UUID | None = None
    custom_role_name: str | None = None  # filled in by /auth/me via a lookup, not a column on User
    # None = every capability (Super Admin / Org Admin); otherwise the
    # exact set Team Lead or a custom role grants — see
    # app.services.permission_service.user_capabilities and
    # app.schemas.user.UserOut.capabilities (same field, this is the
    # duplicate schema /auth/me uses instead of that one).
    capabilities: list[str] | None = None
    org_id: uuid.UUID
    # Same meaning as TokenResponse.org_slug — filled in by /auth/me via a
    # lookup, not a column on User (null for Super Admin).
    org_slug: str | None = None
    must_change_password: bool = False
    team_name: str | None = None  # filled in by /auth/me via a lookup, not a column on User
    profile_image_url: str | None = None  # built from avatar_key, not a column (see _user_out)
    city: str | None = None
    country: str | None = None
    timezone: str | None = None
    companyname: str | None = None
    # Filled in by _user_out via a lookup, not columns on User — lets
    # AuthGuard tell "trial ended, show the upgrade screen" (org_status
    # SUSPENDED + org_suspension_reason "trial_expired") apart from a
    # manual suspension, same spirit as org_slug above. Both None for
    # Super Admin (no org) and for a normal ACTIVE org.
    org_status: str | None = None
    org_suspension_reason: str | None = None

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    """What a user may change about themselves. `username` is only honored
    when the org has allow_custom_username on (see auth.update_me) — sent
    otherwise, it's silently ignored rather than erroring, so the same
    profile form works whether or not the admin has turned the setting on."""
    firstname: str = Field(min_length=1, max_length=100)
    lastname: str = Field(default="", max_length=100)
    username: str | None = Field(default=None, min_length=3, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    timezone: str | None = Field(default=None, max_length=50)
    companyname: str | None = Field(default=None, max_length=200)

    @field_validator("firstname", "lastname")
    @classmethod
    def _clean_name_part(cls, v: str) -> str:
        return " ".join(v.split())  # trim + collapse stray whitespace

    @field_validator("username")
    @classmethod
    def _clean_username(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.strip().lower()
        if not v:
            raise ValueError("Username can't be empty")
        return v

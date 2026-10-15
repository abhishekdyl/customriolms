import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    org_name: str
    name: str
    email: EmailStr
    password: str


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


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(min_length=8)


class UserOut(BaseModel):
    id: uuid.UUID
    firstname: str
    lastname: str
    full_name: str
    username: str
    email: str
    role: str
    org_id: uuid.UUID
    must_change_password: bool = False
    team_name: str | None = None  # filled in by /auth/me via a lookup, not a column on User
    profile_image_url: str | None = None  # built from avatar_key, not a column (see _user_out)
    city: str | None = None
    country: str | None = None
    timezone: str | None = None
    companyname: str | None = None

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

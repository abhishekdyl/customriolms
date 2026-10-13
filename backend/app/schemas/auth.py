import uuid

from pydantic import BaseModel, EmailStr, Field, field_validator


class RegisterRequest(BaseModel):
    org_name: str
    name: str
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
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
    name: str
    email: str
    role: str
    org_id: uuid.UUID
    must_change_password: bool = False
    team_name: str | None = None  # filled in by /auth/me via a lookup, not a column on User

    class Config:
        from_attributes = True


class UpdateProfileRequest(BaseModel):
    """What a user may change about themselves. Deliberately just the name —
    email is their login identity (and is checked against the org's allowed
    domains), and role / team are admin decisions."""
    name: str = Field(min_length=1, max_length=200)

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = " ".join(v.split())  # trim + collapse stray whitespace
        if not v:
            raise ValueError("Name can't be empty")
        return v

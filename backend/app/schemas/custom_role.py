import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from app.models.custom_role import RoleScope

_VALID_SCOPES = (RoleScope.ORG, RoleScope.OWN_TEAM)


class CustomRoleIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=300)
    scope: str = RoleScope.ORG
    capabilities: list[str] = []

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str) -> str:
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name can't be empty")
        return v

    @field_validator("scope")
    @classmethod
    def _valid_scope(cls, v: str) -> str:
        if v not in _VALID_SCOPES:
            raise ValueError(f"scope must be one of {', '.join(_VALID_SCOPES)}")
        return v


class CustomRoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=300)
    scope: str | None = None
    capabilities: list[str] | None = None

    @field_validator("name")
    @classmethod
    def _clean_name(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = " ".join(v.split())
        if not v:
            raise ValueError("Name can't be empty")
        return v

    @field_validator("scope")
    @classmethod
    def _valid_scope(cls, v: str | None) -> str | None:
        if v is not None and v not in _VALID_SCOPES:
            raise ValueError(f"scope must be one of {', '.join(_VALID_SCOPES)}")
        return v


class CustomRoleOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    scope: str
    capabilities: list[str]
    user_count: int = 0  # filled in by the list endpoint, not stored on the row
    created_at: datetime

    class Config:
        from_attributes = True


class CapabilityOut(BaseModel):
    key: str
    label: str


class CapabilityGroupOut(BaseModel):
    group: str
    capabilities: list[CapabilityOut]

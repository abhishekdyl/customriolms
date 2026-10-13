import uuid

from pydantic import BaseModel


class SkillCreate(BaseModel):
    name: str


class SkillUpdate(BaseModel):
    name: str


class SkillOut(BaseModel):
    id: uuid.UUID
    name: str
    module_count: int = 0  # populated by the service, not a DB column

    class Config:
        from_attributes = True

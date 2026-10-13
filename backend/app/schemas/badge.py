import uuid

from pydantic import BaseModel

from app.models.badge import BadgeCriteria


class BadgeCreate(BaseModel):
    name: str
    criteria: BadgeCriteria = BadgeCriteria.STREAK
    value: str
    color: str = "#3D5AFE"


class BadgeUpdate(BaseModel):
    name: str
    criteria: BadgeCriteria
    value: str
    color: str


class BadgeOut(BaseModel):
    id: uuid.UUID
    name: str
    criteria: BadgeCriteria
    value: str
    color: str

    class Config:
        from_attributes = True

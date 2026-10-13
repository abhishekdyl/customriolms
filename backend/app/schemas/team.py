import uuid

from pydantic import BaseModel


class TeamCreate(BaseModel):
    name: str


class TeamUpdate(BaseModel):
    name: str


class TeamOut(BaseModel):
    id: uuid.UUID
    name: str
    member_count: int = 0  # populated by the service layer, not a DB column

    class Config:
        from_attributes = True

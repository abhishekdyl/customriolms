import uuid

from pydantic import BaseModel


class CategoryCreate(BaseModel):
    name: str
    color: str = "#3D5AFE"


class CategoryUpdate(BaseModel):
    name: str
    color: str


class CategoryOut(BaseModel):
    id: uuid.UUID
    name: str
    color: str
    course_count: int = 0  # populated by the service, not a DB column

    class Config:
        from_attributes = True

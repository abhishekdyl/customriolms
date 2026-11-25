import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CourseAnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)


class CourseAnnouncementUpdate(BaseModel):
    """Partial update — a manager can change the text, and/or flip
    is_hidden (the "hide"/"unhide" action), in the same call or
    separately. Deleting is its own DELETE endpoint, not expressible
    here."""
    title: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = Field(default=None, min_length=1)
    is_hidden: bool | None = None


class CourseAnnouncementOut(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    is_hidden: bool
    author_name: str | None  # None if the author's user row no longer exists
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

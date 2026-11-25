import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class CourseAnnouncementIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    body: str = Field(min_length=1)


class CourseAnnouncementUpdate(BaseModel):
    """Partial update — a manager can change the text, flip is_hidden
    (the "hide"/"unhide" action), and/or flip comments_enabled (turns
    this announcement's discussion thread on/off), in the same call or
    separately. Deleting is its own DELETE endpoint, not expressible
    here."""
    title: str | None = Field(default=None, min_length=1, max_length=300)
    body: str | None = Field(default=None, min_length=1)
    is_hidden: bool | None = None
    comments_enabled: bool | None = None


class CourseAnnouncementOut(BaseModel):
    id: uuid.UUID
    title: str
    body: str
    is_hidden: bool
    comments_enabled: bool
    comment_count: int
    author_name: str | None  # None if the author's user row no longer exists
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class CourseAnnouncementCommentIn(BaseModel):
    body: str = Field(min_length=1)


class CourseAnnouncementCommentOut(BaseModel):
    id: uuid.UUID
    body: str
    author_name: str | None
    # True when the author was this course's Teacher or an Org/Super
    # Admin — computed at read time from the CURRENT roster
    # (Course.teacher_user_ids / the author's current role), not stored
    # on the comment itself, so it reflects who they are now, same as
    # author_name above.
    is_manager: bool
    created_at: datetime

    class Config:
        from_attributes = True

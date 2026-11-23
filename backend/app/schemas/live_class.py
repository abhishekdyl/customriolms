import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

Provider = Literal["bigbluebutton", "zoom"]
TargetScope = Literal["all", "course", "individual"]
Status = Literal["scheduled", "live", "ended"]


class LiveClassIn(BaseModel):
    title: str = Field(min_length=1, max_length=300)
    description: str = ""
    provider: Provider
    scheduled_start: datetime
    duration_minutes: int = Field(default=60, ge=5, le=480)
    target_scope: TargetScope = "all"
    course_id: uuid.UUID | None = None
    user_ids: list[uuid.UUID] = []
    recording_url: str | None = None

    @model_validator(mode="after")
    def _validate_target(self):
        if self.target_scope == "course" and self.course_id is None:
            raise ValueError("Pick a course when the target is a specific course's users")
        if self.target_scope == "individual" and not self.user_ids:
            raise ValueError("Pick at least one user when the target is a hand-picked list")
        return self


class LiveClassOut(BaseModel):
    id: uuid.UUID
    title: str
    description: str
    provider: Provider
    scheduled_start: datetime
    duration_minutes: int
    target_scope: TargetScope
    course_id: uuid.UUID | None
    course_title: str | None = None  # convenience for the admin list — avoids a second lookup per row
    user_ids: list[uuid.UUID]
    recording_url: str | None
    created_by: uuid.UUID
    created_by_name: str | None = None
    created_at: datetime
    # Derived, not stored — see LiveClass's own docstring.
    status: Status

    class Config:
        from_attributes = True


class JoinOut(BaseModel):
    """What POST /live-classes/{id}/join hands back — a fresh, single-
    use-ish URL to open right now, never something to store or share.
    BBB's URL especially is only valid because it's freshly signed on
    this exact call; Zoom's is longer-lived but still per-role
    (moderator vs attendee), so the same "just tell me where to go"
    response shape fits both."""
    join_url: str
    is_host: bool

import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator


class CourseRatingIn(BaseModel):
    rating: int = Field(ge=1, le=5)
    review_text: str | None = None

    @model_validator(mode="after")
    def _require_text_for_low_ratings(self):
        # 1-3 stars: tell us what went wrong. 4-5 stars: nothing to
        # justify, the box is just there if they want to add something.
        if self.rating < 4 and not (self.review_text or "").strip():
            raise ValueError("Please add a quick note on what we can improve")
        if self.review_text is not None:
            self.review_text = self.review_text.strip() or None
        return self


class CourseRatingOut(BaseModel):
    """What the public review list shows — no reviewer identity at
    all, by design (see course_rating_service)."""
    id: uuid.UUID
    rating: int
    review_text: str | None
    created_at: datetime

    class Config:
        from_attributes = True


class MyCourseRatingOut(CourseRatingOut):
    """Same shape plus updated_at, for pre-filling "edit my rating" —
    this one IS tied to the caller, so there's no anonymity to protect."""
    updated_at: datetime


class CourseRatingSummary(BaseModel):
    average: float | None  # None when there are zero ratings yet
    count: int
    distribution: dict[int, int]  # {1: 0, 2: 1, 3: 0, 4: 2, 5: 9}


class CourseRatingAdminOut(CourseRatingOut):
    """Moderation view — Org Admin / course creator only. Unlike the
    public list, this DOES carry who wrote it, because moderation
    without knowing who you're moderating isn't moderation."""
    user_id: uuid.UUID
    user_name: str
    user_email: str


class CourseRatingModerateUpdate(BaseModel):
    """What an Org Admin / course creator may change on someone else's
    review — never the star rating itself (that's the learner's own
    honest opinion), only the text, e.g. to redact something."""
    review_text: str | None = None

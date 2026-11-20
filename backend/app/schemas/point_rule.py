import uuid

from pydantic import BaseModel, Field, model_validator

from app.models.point_rule import RuleEvent, RuleScope


class PointRuleCreate(BaseModel):
    """POST /api/v1/point-rules — upserts: if a rule already exists for
    the same (scope, course_id/module_id, event), it's updated in place
    rather than creating a duplicate row."""
    scope: RuleScope
    course_id: uuid.UUID | None = None
    module_id: uuid.UUID | None = None
    event: RuleEvent
    points: int = Field(ge=0, le=100_000)

    @model_validator(mode="after")
    def _check_shape(self):
        if self.scope == RuleScope.COURSE:
            if self.course_id is None:
                raise ValueError("course_id is required for scope=course")
            if self.event != RuleEvent.COMPLETE:
                raise ValueError("Course-scoped rules can only be event=complete — this app has no 'course started' event")
        else:
            if self.module_id is None:
                raise ValueError("module_id is required for scope=module")
        return self


class PointRuleOut(BaseModel):
    id: uuid.UUID
    scope: RuleScope
    event: RuleEvent
    points: int
    course_id: uuid.UUID
    course_title: str
    module_id: uuid.UUID | None = None
    module_title: str | None = None
    module_type: str | None = None

    class Config:
        from_attributes = True

import uuid

from pydantic import BaseModel, Field


class PointsUpdate(BaseModel):
    """Body for PUT /point-rules/courses/{course_id} and
    /point-rules/modules/{module_id} — points=None clears the override
    and reverts that course/module to the org's own default."""
    points: int | None = Field(default=None, ge=0, le=100_000)


class CoursePointsOut(BaseModel):
    course_id: uuid.UUID
    title: str
    points: int
    is_override: bool  # False = showing the org's default_course_points, not a rule of its own


class ModulePointsOut(BaseModel):
    module_id: uuid.UUID
    course_id: uuid.UUID
    title: str
    type: str
    points: int
    is_override: bool  # False = showing the org's default_module_points, not a rule of its own

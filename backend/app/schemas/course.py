import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.module import ModuleType


# ---------- Quiz questions (authoring content, not attempts) ----------
class QuizQuestionIn(BaseModel):
    text: str
    options: list[str] = Field(min_length=2)
    correct_index: int


class QuizQuestionOut(QuizQuestionIn):
    id: uuid.UUID

    class Config:
        from_attributes = True


# ---------- Modules ----------
class ModuleCreate(BaseModel):
    title: str
    type: ModuleType = ModuleType.WATCH
    required: bool = True
    threshold: int = 90


class ModuleUpdate(BaseModel):
    title: str | None = None
    type: ModuleType | None = None
    required: bool | None = None
    threshold: int | None = None
    file_url: str | None = None
    file_name: str | None = None
    file_size_label: str | None = None
    instructions: str | None = None
    skill_ids: list[uuid.UUID] | None = None
    badge_ids: list[uuid.UUID] | None = None
    certificate_enabled: bool | None = None
    certificate_template_id: uuid.UUID | None = None
    certificate_name: str | None = None
    questions: list[QuizQuestionIn] | None = None  # replaces the full question set when provided


class ModuleOut(BaseModel):
    id: uuid.UUID
    title: str
    type: ModuleType
    position: int
    required: bool
    threshold: int
    file_url: str | None
    file_name: str | None
    file_size_label: str | None
    instructions: str | None
    skill_ids: list[uuid.UUID]
    badge_ids: list[uuid.UUID]
    certificate_enabled: bool
    certificate_template_id: uuid.UUID | None
    certificate_name: str | None
    questions: list[QuizQuestionOut] = []

    class Config:
        from_attributes = True


class ModuleReorderRequest(BaseModel):
    module_ids: list[uuid.UUID]  # full ordered list — position is assigned by index


# ---------- Courses ----------
class CourseCreate(BaseModel):
    title: str
    category_id: uuid.UUID | None = None
    description: str | None = None
    duration_label: str = ""
    opens_at: datetime | None = None
    closes_at: datetime | None = None


class CourseUpdate(BaseModel):
    title: str | None = None
    category_id: uuid.UUID | None = None
    description: str | None = None
    duration_label: str | None = None
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    certificate_enabled: bool | None = None
    certificate_template_id: uuid.UUID | None = None
    certificate_name: str | None = None
    certificate_org_name: str | None = None
    badge_ids: list[uuid.UUID] | None = None


class CourseAssignRequest(BaseModel):
    team_ids: list[uuid.UUID] = []
    user_ids: list[uuid.UUID] = []


class EnrolledLearnerOut(BaseModel):
    """One learner enrolled in a course — via their team or assigned
    directly — with their own progress on it. Backs the "who's enrolled"
    view on the admin/team-lead course page (GET /courses/{id}/enrolled)."""
    user_id: uuid.UUID
    name: str
    email: str
    team_name: str | None
    via: str  # "team" | "direct" — how they ended up enrolled
    progress_pct: int
    completed: bool


class CourseOut(BaseModel):
    id: uuid.UUID
    title: str
    category_id: uuid.UUID | None
    category_name: str | None = None  # populated by the service via the join, not a DB column
    description: str | None
    duration_label: str
    opens_at: datetime | None
    closes_at: datetime | None
    assigned_team_ids: list[uuid.UUID]
    assigned_user_ids: list[uuid.UUID]
    certificate_enabled: bool
    certificate_template_id: uuid.UUID | None
    certificate_name: str | None
    certificate_org_name: str | None
    badge_ids: list[uuid.UUID]
    modules: list[ModuleOut] = []

    class Config:
        from_attributes = True


class CourseListItem(BaseModel):
    """Lighter shape for the list view — no modules, matches the CourseCard the frontend renders."""
    id: uuid.UUID
    title: str
    category_id: uuid.UUID | None
    category_name: str | None = None
    duration_label: str
    module_count: int = 0
    assigned_team_count: int = 0
    opens_at: datetime | None = None
    closes_at: datetime | None = None

    class Config:
        from_attributes = True


class MyCourseItem(CourseListItem):
    """What a learner sees on Home / My Courses: a course assigned to them
    (via their team or directly), plus their own progress on it.

    progress_pct is 0 for now — per-learner progress tracking
    (enrollments / module_progress) isn't built yet. The frontend already
    renders it, so wiring real numbers later is a backend-only change."""
    progress_pct: int = 0


# ---------- Learner-facing course view ----------
# Deliberately separate from CourseOut/ModuleOut: those carry authoring data
# (quiz `correct_index`, certificate config, assignment lists) that a learner
# must never receive. Everything here is safe to hand to the course's learner.
class LearnerQuizQuestionOut(BaseModel):
    id: uuid.UUID
    text: str
    options: list[str]  # no correct_index — answers are checked server-side

    class Config:
        from_attributes = True


class LearnerModuleOut(BaseModel):
    id: uuid.UUID
    title: str
    type: ModuleType
    position: int
    required: bool
    threshold: int
    file_url: str | None = None
    file_name: str | None = None
    file_size_label: str | None = None
    instructions: str | None = None
    skill_count: int = 0
    questions: list[LearnerQuizQuestionOut] = []
    completed: bool = False  # always False until module progress tracking exists


class LearnerCourseOut(MyCourseItem):
    description: str | None = None
    modules: list[LearnerModuleOut] = []
    completed_module_count: int = 0

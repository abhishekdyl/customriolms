import uuid
from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.models.module import ModuleType
from app.schemas.question import QuestionIn, QuestionLearnerOut, QuestionOut
from app.services import storage_service


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
    # file_url/file_name/file_size_label are deliberately not here — a
    # module's file is only ever set by the real upload endpoint (and
    # cleared by the matching delete endpoint), never by a free-text PATCH.
    instructions: str | None = None
    skill_ids: list[uuid.UUID] | None = None
    badge_ids: list[uuid.UUID] | None = None
    certificate_enabled: bool | None = None
    certificate_template_id: uuid.UUID | None = None
    certificate_name: str | None = None
    questions: list[QuestionIn] | None = None  # replaces the full question set when provided


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
    # Not sent to the client (exclude=True) — it's the storage object key,
    # only used below to recompute a fresh file_url. Including it in the
    # schema at all (rather than reading straight off the ORM object) is
    # what lets the model_validator below see it after from_attributes
    # has already converted everything else.
    file_key: str | None = Field(default=None, exclude=True)
    scorm_launch_path: str | None = None
    scorm_version: str | None = None
    instructions: str | None
    skill_ids: list[uuid.UUID]
    badge_ids: list[uuid.UUID]
    certificate_enabled: bool
    certificate_template_id: uuid.UUID | None
    certificate_name: str | None
    questions: list[QuestionOut] = []

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def _resolve_file_url(self):
        # A presigned URL expires, so it's never stored — it's generated
        # fresh on every read from the permanent file_key. Falls back to
        # whatever's in file_url for the rare pre-upload-feature row that
        # has a legacy value and no key. For a SCORM module, file_key is a
        # folder prefix, not a single object, so there's no single
        # presigned URL for it — the player hits the scorm-content
        # endpoint directly instead (see courses.py).
        if self.file_key and self.type != ModuleType.SCORM:
            self.file_url = storage_service.presigned_get_url(self.file_key)
        return self


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
    # null clears the rule ("every required module" again); any other
    # value must be one of this course's own module ids — validated in
    # the endpoint, not here, since that needs the course loaded.
    completion_module_id: uuid.UUID | None = None
    sequential_unlock: bool | None = None


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


class ModuleSummaryOut(BaseModel):
    """Just enough to label a column in the module-progress matrix below —
    not a full ModuleOut, which also carries quiz questions/answer keys
    this view has no business returning."""
    id: uuid.UUID
    title: str
    type: str
    required: bool


class ModuleProgressCellOut(BaseModel):
    module_id: uuid.UUID
    completed: bool
    score: int | None = None  # quiz score or watched-% where that applies, else null


class LearnerModuleProgressOut(BaseModel):
    user_id: uuid.UUID
    name: str
    email: str
    team_name: str | None
    course_completed: bool
    cells: list[ModuleProgressCellOut]  # same order as CourseModuleProgressOut.modules


class CourseModuleProgressOut(BaseModel):
    """The Moodle-style "who completed which module" matrix (GET
    /courses/{id}/module-progress, Org Admin / Team Lead) — modules as
    columns, learners as rows, backing list_module_progress."""
    modules: list[ModuleSummaryOut]
    learners: list[LearnerModuleProgressOut]


class QuizAttemptAnswerOut(BaseModel):
    """One question's answer on one attempt, as it was snapshotted at
    submit time — see QuizAttempt's docstring for why this isn't a live
    join back to the question."""
    question_id: str
    question_type: str
    question_text: str | None
    options: list[dict]
    picked_option_id: str | None
    picked_option_text: str | None
    picked_text: str | None
    correct_option_id: str | None
    correct_option_text: str | None
    accepted_answers: list[str]
    correct: bool


class QuizAttemptOut(BaseModel):
    """One learner's one submission of one quiz module — backs the Org
    Admin/Team Lead "quiz submissions" review (GET
    /courses/{id}/quiz-attempts): every attempt, pass or fail, with
    exactly what was answered."""
    id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    user_email: str
    module_id: uuid.UUID
    module_title: str
    score: int
    passed: bool
    created_at: datetime
    answers: list[QuizAttemptAnswerOut]


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
    completion_module_id: uuid.UUID | None = None
    sequential_unlock: bool = False
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
# (correct_option_id, accepted_answers, certificate config, assignment
# lists) that a learner must never receive. Everything here is safe to
# hand to the course's learner. QuestionLearnerOut (schemas/question.py)
# is the shared no-answers question shape.
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
    scorm_launch_path: str | None = None
    scorm_version: str | None = None
    instructions: str | None = None
    skill_count: int = 0
    questions: list[QuestionLearnerOut] = []
    completed: bool = False
    # Best score/watched-% recorded so far (ModuleProgress.score) — null
    # until there's a passing attempt, since an in-progress/failed try
    # isn't persisted as module progress at all (see learn_service).
    score: int | None = None
    # True only when the course has sequential_unlock on AND the module
    # immediately before this one (by position) isn't done yet — always
    # False otherwise. file_url/questions are already stripped when this
    # is true (see get_my_course), so the frontend just needs this to
    # show the locked state, not to re-derive it.
    locked: bool = False


class LearnerCourseOut(MyCourseItem):
    description: str | None = None
    modules: list[LearnerModuleOut] = []
    completed_module_count: int = 0

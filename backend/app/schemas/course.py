import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.models.module import ModuleType
from app.schemas.question import QuestionIn, QuestionLearnerOut, QuestionOut
from app.services import storage_service


# ---------- Modules ----------
class ModuleCreate(BaseModel):
    title: str
    type: ModuleType = ModuleType.WATCH
    required: bool = True
    threshold: int = 90
    # WATCH-only extra completion gate (min correct in-video answers,
    # alongside the watched-% threshold above) — see Module's own
    # docstring. None = no such gate. Set via update_module afterward in
    # practice (the create form doesn't need it up front), but accepted
    # here too for symmetry.
    video_question_min_correct: int | None = None
    # Retake control — see Module's docstring. Off (the default) means
    # exactly one attempt ever; on, retake_limit caps the total number of
    # attempts (null = unlimited).
    retake_enabled: bool = False
    retake_limit: int | None = None

    @field_validator("retake_limit")
    @classmethod
    def _positive_limit(cls, v):
        if v is not None and v < 1:
            raise ValueError("retake_limit must be at least 1, or omitted for unlimited")
        return v


class ModuleRestrictionIn(BaseModel):
    """One access condition on a module (Module.restrictions) — admin
    authoring shape, validated here; what's actually true-or-false at
    runtime for a given learner is learn_service.module_locked. ALL of a
    module's restrictions must pass (AND) before it's reachable; this is
    independent of (and stacks with) the course-wide sequential_unlock
    position-order lock.

    - date_window: opens_at/closes_at bound WHEN this module is reachable
      — e.g. "only between 15 and 20 Oct", separate from the course's own
      opens_at/closes_at.
    - profile_field: the learner's own profile field (country / location /
      job_title — the free-text fields on User) must equal `value`.
    - module_score: an earlier module (`module_id`) must already have a
      recorded score of at least `min_score`.
    """
    type: Literal["date_window", "profile_field", "module_score"]
    opens_at: datetime | None = None
    closes_at: datetime | None = None
    field: str | None = None
    value: str | None = None
    module_id: uuid.UUID | None = None
    min_score: int | None = None

    @model_validator(mode="after")
    def _check_shape(self):
        if self.type == "date_window":
            if self.opens_at is None and self.closes_at is None:
                raise ValueError("A date window restriction needs an opens_at, a closes_at, or both")
            if self.opens_at and self.closes_at and self.closes_at <= self.opens_at:
                raise ValueError("closes_at must be after opens_at")
        elif self.type == "profile_field":
            if self.field not in ("country", "location", "job_title"):
                raise ValueError('field must be one of "country", "location", "job_title"')
            if not (self.value or "").strip():
                raise ValueError("A profile_field restriction needs a value to match")
        elif self.type == "module_score":
            if self.module_id is None:
                raise ValueError("A module_score restriction needs module_id")
            if self.min_score is None or not (0 <= self.min_score <= 100):
                raise ValueError("min_score must be between 0 and 100")
        return self


class ModuleUpdate(BaseModel):
    title: str | None = None
    type: ModuleType | None = None
    required: bool | None = None
    threshold: int | None = None
    video_question_min_correct: int | None = None
    retake_enabled: bool | None = None
    # Sending this key with a value sets the cap; sending it explicitly
    # as null clears it back to unlimited — model_dump(exclude_unset=True)
    # in update_module tells "omitted" (field absent from the request,
    # left alone) apart from "sent as null" (field present, value None),
    # same pattern as every other nullable field here (e.g.
    # certificate_template_id above).
    retake_limit: int | None = None
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
    # Replaces the full restriction set when provided, same as questions
    # above — the authoring UI always sends the complete list back.
    restrictions: list[ModuleRestrictionIn] | None = None
    # Draft/published gate — see Module.published's docstring. Omitted
    # (the normal case) lets a plain Save auto-publish a still-draft
    # module; sending it explicitly is how the admin manually
    # publishes/un-publishes on demand.
    published: bool | None = None

    @field_validator("retake_limit")
    @classmethod
    def _positive_limit(cls, v):
        if v is not None and v < 1:
            raise ValueError("retake_limit must be at least 1, or omitted/null for unlimited")
        return v


class ModuleOut(BaseModel):
    id: uuid.UUID
    title: str
    type: ModuleType
    position: int
    required: bool
    threshold: int
    video_question_min_correct: int | None = None
    retake_enabled: bool = False
    retake_limit: int | None = None
    published: bool = True
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
    # Plain JSON passthrough of what's stored — already in the
    # ModuleRestrictionIn shape (opens_at/closes_at as ISO strings,
    # module_id as a string), so the authoring UI reads it with the same
    # shape it writes.
    restrictions: list[dict] = []

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
    # [] or null clears the rule ("every required module" again);
    # otherwise every id must be one of this course's own module ids —
    # validated in the endpoint, not here, since that needs the course
    # loaded. Non-empty means "every module in this list must be done",
    # not just one — see learn_service.course_progress.
    completion_module_ids: list[uuid.UUID] | None = None
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
    # This question's own weight (ModuleQuizQuestion.points at submit
    # time) — None for an attempt recorded before this existed.
    points: int | None = None


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
    # Raw marks alongside `score`'s percent — "7/10 marks", not just
    # "70%". None on an attempt recorded before this existed (no
    # per-question points to recompute them from).
    earned_points: int | None = None
    total_points: int | None = None
    created_at: datetime
    answers: list[QuizAttemptAnswerOut]


class AttemptOverrideSet(BaseModel):
    """Body for PUT .../modules/{module_id}/attempt-overrides/{user_id} —
    sets (replacing, not adding to) this one learner's extra attempts on
    this one module, on top of whatever the module's own retake_limit
    already allows them. 0 clears/revokes the exception."""
    extra_attempts: int = Field(ge=0)


class AttemptOverrideOut(BaseModel):
    module_id: uuid.UUID
    user_id: uuid.UUID
    extra_attempts: int


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
    completion_module_ids: list[uuid.UUID] = []
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
    video_question_min_correct: int | None = None
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
    # Retake settings (QUIZ modules only — see Module's docstring) plus
    # how many attempts this learner has already made, so the frontend
    # can show "2 of 3 attempts used" / disable the retake button without
    # a separate round trip. attempts_used is 0 until the first attempt.
    retake_enabled: bool = False
    retake_limit: int | None = None
    attempts_used: int = 0
    # WATCH modules only — lets the player resume exactly where the
    # learner left off (reload / new tab / fresh login) without a separate
    # round trip: furthest point actually reached, and which in-video
    # questions were already answered THIS attempt (so they're skipped on
    # replay rather than asked again). Both reset to 0/[] by an explicit
    # retake. See learn_service.checkpoint_watch_progress/retake_watch_module.
    watch_furthest_pct: int = 0
    watch_answered_question_ids: list[uuid.UUID] = []
    # True when sequential_unlock blocks this module OR any one of its
    # own restrictions isn't satisfied yet — see learn_service.module_locked.
    # file_url/questions are already stripped when this is true (see
    # get_my_course), so the frontend just needs this to show the locked
    # state, not to re-derive it.
    locked: bool = False
    # Human-readable reason for the lock above (null when not locked) —
    # e.g. "Finish \"X\" first…", "Opens on 15 Oct 2026", "Score at least
    # 60% on \"Y\" first." Comes straight from module_locked so the
    # frontend never has to guess which rule fired.
    lock_reason: str | None = None


class LearnerCourseOut(MyCourseItem):
    description: str | None = None
    modules: list[LearnerModuleOut] = []
    completed_module_count: int = 0

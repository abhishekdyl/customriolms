import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.certificate import CertTemplateOut
from app.schemas.question import QuestionLearnerOut


class LearnSummary(BaseModel):
    name: str
    streak: int
    week: list[bool]            # Mon..Fri — did the learner complete something that day
    days_trained: int
    assigned_count: int
    in_progress_count: int
    completed_count: int
    next_course_id: uuid.UUID | None
    next_course_title: str | None
    next_course_modules: int = 0
    has_unread: bool = False


class LearnCourseItem(BaseModel):
    id: uuid.UUID
    title: str
    category_name: str | None
    duration_label: str
    module_count: int
    completed_modules: int
    progress: int               # 0-100
    status: str                 # not_started | in_progress | completed
    cover_index: int            # stable palette slot for the cover colour


class LearnModule(BaseModel):
    id: uuid.UUID
    title: str
    type: str
    required: bool
    threshold: int
    completed: bool
    score: int | None
    skill_count: int
    file_name: str | None
    instructions: str | None
    # QuestionLearnerOut (schemas/question.py) is the shared no-answers
    # question shape — also used by the live /courses/mine/* path.
    questions: list[QuestionLearnerOut] = []


class LearnCourseDetail(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    category_name: str | None
    duration_label: str
    progress: int
    status: str
    modules: list[LearnModule]


class QuizAnswerIn(BaseModel):
    """One answer to one question, keyed by question_id (not position) so a
    client that only sends a subset, or sends them out of order, still
    scores correctly. option_id answers MCQ/TRUE_FALSE; text answers
    SHORT_ANSWER. Both are optional so an unanswered question just scores
    wrong rather than failing validation. Also used for a WATCH module's
    in-video question answers, accumulated client-side during playback and
    sent as CompleteRequest.answers — an entry simply absent here (not
    "wrong") is how a skipped-on-timeout in-video question stays uncounted
    rather than scored against the learner."""
    question_id: uuid.UUID
    option_id: str | None = None
    text: str | None = None


class QuizSubmit(BaseModel):
    answers: list[QuizAnswerIn]


class QuizQuestionResult(BaseModel):
    question_id: uuid.UUID
    picked_option_id: str | None = None
    picked_text: str | None = None
    correct_option_id: str | None = None
    correct: bool


class CompleteRequest(BaseModel):
    """Body for POST .../modules/{id}/complete. Only WATCH modules actually
    use watched_pct/answers — watched_pct is how far through the video the
    player tracked the learner reaching (the running max, not just wherever
    playback currently sits, so scrubbing to the end doesn't let someone
    skip the real watch-through); answers is every in-video question the
    learner actually submitted (an untimed-out skip is simply missing from
    this list — see QuizAnswerIn's docstring). Every other module type
    ignores both; omit them entirely and the call still works for them."""
    watched_pct: int | None = None
    answers: list[QuizAnswerIn] = []


class CompleteResult(BaseModel):
    progress: int
    course_completed: bool
    certificate_code: str | None = None
    # Populated only when the WATCH module had in-video questions —
    # per-question correctness, same shape as QuizResult.results, so the
    # frontend can reconcile its own live feedback against what the
    # server actually scored and persisted.
    video_question_results: list[QuizQuestionResult] = []
    # Raw marks for those in-video questions ("earned 2/3 marks"), None
    # when the module had none.
    video_earned_points: int | None = None
    video_total_points: int | None = None
    # Same retake bookkeeping as QuizResult, for a WATCH module's in-video
    # questions — meaningless (left at the defaults) for a module with no
    # in-video questions. See learn_service.complete_module/retake_watch_module.
    attempts_used: int = 1
    attempts_remaining: int | None = None
    retake_allowed: bool = False


class WatchCheckpointAnswer(BaseModel):
    """One in-video question answer, checkpointed the moment it's
    submitted — same shape as QuizAnswerIn, kept separate so a checkpoint
    call can omit it entirely (watched_pct-only ping) without an awkward
    all-optional QuizAnswerIn floating around."""
    question_id: uuid.UUID
    option_id: str | None = None
    text: str | None = None


class WatchCheckpointIn(BaseModel):
    """Body for PATCH .../modules/{id}/watch-progress — called continuously
    during playback so a reload/new-tab/relogin resumes exactly where the
    learner left off. Both fields optional: a pure pct ping sends only
    watched_pct; answering an in-video question sends only `answer`
    (sending both in one call is fine too)."""
    watched_pct: int | None = None
    answer: WatchCheckpointAnswer | None = None


class WatchProgressOut(BaseModel):
    furthest_pct: int
    answered_question_ids: list[uuid.UUID]
    attempt_number: int


class QuizResult(BaseModel):
    score: int
    passed: bool
    threshold: int
    results: list[QuizQuestionResult]
    earned_points: int
    total_points: int
    progress: int
    course_completed: bool
    certificate_code: str | None = None
    # How many attempts (this one included) the learner has made on this
    # module, and whether another is still allowed — see Module.docstring
    # and learn_service.submit_quiz. attempts_remaining is null when
    # retakes are unlimited.
    attempts_used: int = 1
    attempts_remaining: int | None = None
    retake_allowed: bool = False


class SkillScore(BaseModel):
    id: uuid.UUID
    name: str
    value: int


class BadgeStatus(BaseModel):
    id: uuid.UUID
    name: str
    criteria: str
    value: str
    color: str
    earned: bool


class CertItem(BaseModel):
    id: uuid.UUID
    course_title: str
    code: str
    issued_at: datetime


class LearnProgress(BaseModel):
    streak: int
    completed_courses: int
    rank: int
    points: int
    skills: list[SkillScore]
    badges: list[BadgeStatus]
    certificates: list[CertItem]


class LeaderRow(BaseModel):
    id: uuid.UUID
    name: str
    team_name: str | None
    points: int
    is_me: bool


class ProfileOut(BaseModel):
    name: str
    email: str
    team_name: str | None
    role: str
    phone: str | None
    job_title: str | None
    location: str | None
    bio: str | None
    # Free text — what a module's "profile_field" restriction can match
    # against (see schemas/course.py's ModuleRestrictionIn).
    country: str | None = None


class ProfileUpdate(BaseModel):
    """Everything a learner may edit about themselves. Email is intentionally absent —
    it is their login username."""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    job_title: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=500)
    country: str | None = Field(default=None, max_length=100)


class LearnNotification(BaseModel):
    id: str
    kind: str                   # certificate | course
    title: str
    at: datetime | None


class CertDetail(BaseModel):
    id: uuid.UUID
    code: str
    learner_name: str
    course_title: str
    certification_name: str
    issuer_name: str
    duration: str
    issued_at: datetime
    template: CertTemplateOut

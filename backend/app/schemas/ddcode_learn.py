import uuid
from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.certificate import CertTemplateOut


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


class QuizQuestionOut(BaseModel):
    id: uuid.UUID
    text: str
    options: list[str]          # NOTE: correct_index is deliberately never sent before submitting


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
    questions: list[QuizQuestionOut] = []


class LearnCourseDetail(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    category_name: str | None
    duration_label: str
    progress: int
    status: str
    modules: list[LearnModule]


class CompleteResult(BaseModel):
    progress: int
    course_completed: bool
    certificate_code: str | None = None


class QuizSubmit(BaseModel):
    answers: list[int]


class QuizQuestionResult(BaseModel):
    question_id: uuid.UUID
    picked: int | None
    correct_index: int
    correct: bool


class QuizResult(BaseModel):
    score: int
    passed: bool
    threshold: int
    results: list[QuizQuestionResult]
    progress: int
    course_completed: bool
    certificate_code: str | None = None


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


class ProfileUpdate(BaseModel):
    """Everything a learner may edit about themselves. Email is intentionally absent —
    it is their login username."""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=30)
    job_title: str | None = Field(default=None, max_length=120)
    location: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=500)


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

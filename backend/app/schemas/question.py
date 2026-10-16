"""
Shared question shape for both a module's own quiz questions
(ModuleQuizQuestion) and a question-bank question (BankQuestion) — see
those models' docstrings for why they're two tables with the same
columns rather than one. These schemas are the single place that
shape is validated and serialized, used by both course_service.py
(module quiz authoring) and question_bank_service.py.
"""
import uuid

from pydantic import BaseModel, Field, model_validator

from app.models.module import QuestionType
from app.services import storage_service


class OptionIn(BaseModel):
    """One MCQ/TRUE_FALSE option as the admin authors it. At least one of
    text/image_key is required — a picture-quiz option is just an option
    with an image_key and no text, not a different shape."""
    id: str
    text: str | None = None
    image_key: str | None = None

    @model_validator(mode="after")
    def _at_least_one(self):
        if not (self.text or "").strip() and not self.image_key:
            raise ValueError("Each option needs text, an image, or both")
        return self


class OptionOut(BaseModel):
    id: str
    text: str | None = None
    # image_key is the permanent value the authoring UI must round-trip
    # back (as OptionIn.image_key) when it re-saves a question it didn't
    # touch the image on — it has no way to know the key otherwise, since
    # only a presigned (expiring) image_url would otherwise come back.
    # Not sensitive on its own (image_url already reveals far more), so
    # it's fine on the shared OptionOut used by both the authoring and
    # the learner question shape.
    image_key: str | None = None
    image_url: str | None = None  # presigned fresh on every read — see _resolve_images below

    class Config:
        from_attributes = True


class QuestionIn(BaseModel):
    """What the admin authoring UI sends to create/replace a question —
    for a module (ModuleUpdate.questions) or a question bank
    (QuestionBankCreateQuestion)."""
    type: QuestionType = QuestionType.MCQ
    text: str | None = None
    image_key: str | None = None
    options: list[OptionIn] = []
    correct_option_id: str | None = None
    accepted_answers: list[str] = []
    # In-video placement — only meaningful (and only validated) for a
    # WATCH module's questions; course_service.update_module enforces the
    # WATCH-specific rules (required here, no images, etc.) since this
    # schema alone doesn't know which module it's attached to. None on a
    # QUIZ module's questions.
    trigger_time_sec: int | None = None
    # None = no display timer — the video stays paused until the learner
    # submits. Otherwise seconds the question stays on screen before
    # auto-submit (if an option is picked) or skip (uncounted, not wrong).
    timer_seconds: int | None = None
    # Marks for one correct answer to this question. Defaults to 1 so
    # existing count-based QUIZ scoring is unaffected unless changed.
    points: int = 1

    @model_validator(mode="after")
    def _validate_shape(self):
        if not (self.text or "").strip() and not self.image_key:
            raise ValueError("A question needs text, an image, or both")

        if self.type in (QuestionType.MCQ, QuestionType.TRUE_FALSE):
            if len(self.options) < 2:
                raise ValueError("An MCQ/True-False question needs at least 2 options")
            if self.type is QuestionType.TRUE_FALSE and len(self.options) != 2:
                raise ValueError("A True/False question needs exactly 2 options")
            ids = [o.id for o in self.options]
            if len(set(ids)) != len(ids):
                raise ValueError("Option ids must be unique within a question")
            if self.correct_option_id not in ids:
                raise ValueError("correct_option_id must match one of the options' ids")
        elif self.type is QuestionType.SHORT_ANSWER:
            if not any((a or "").strip() for a in self.accepted_answers):
                raise ValueError("A short-answer question needs at least one accepted answer")

        if self.trigger_time_sec is not None and self.trigger_time_sec < 0:
            raise ValueError("trigger_time_sec can't be negative")
        if self.timer_seconds is not None and self.timer_seconds <= 0:
            raise ValueError("timer_seconds must be positive when set")
        if self.points < 1:
            raise ValueError("points must be at least 1")
        return self


class QuestionOut(BaseModel):
    """Authoring view — includes correct_option_id/accepted_answers, and
    (unlike QuestionLearnerOut) keeps image_key visible rather than
    excluded: the authoring UI has to send it straight back as
    QuestionIn.image_key when it re-saves a question it didn't touch the
    image on, and a presigned (expiring) image_url alone can't round-trip
    that way. Never sent to a learner before they submit; see
    QuestionLearnerOut."""
    id: uuid.UUID
    type: QuestionType
    text: str | None
    image_key: str | None = None
    image_url: str | None = None
    options_json: list[dict] = Field(default=[], exclude=True)
    options: list[OptionOut] = []
    correct_option_id: str | None
    accepted_answers: list[str]
    trigger_time_sec: int | None = None
    timer_seconds: int | None = None
    points: int = 1

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def _resolve_images(self):
        if self.image_key:
            self.image_url = storage_service.presigned_get_url(self.image_key)
        self.options = [
            OptionOut(id=o["id"], text=o.get("text"), image_key=o.get("image_key"),
                      image_url=storage_service.presigned_get_url(o["image_key"]) if o.get("image_key") else None)
            for o in (self.options_json or [])
        ]
        return self


class QuestionLearnerOut(BaseModel):
    """What a learner sees before answering — no correct_option_id, no
    accepted_answers. trigger_time_sec/timer_seconds ARE included (unlike
    the answer key) — the WATCH player needs them to know when to pause
    and whether to run a countdown."""
    id: uuid.UUID
    type: QuestionType
    text: str | None
    image_key: str | None = Field(default=None, exclude=True)
    image_url: str | None = None
    options_json: list[dict] = Field(default=[], exclude=True)
    options: list[OptionOut] = []
    trigger_time_sec: int | None = None
    timer_seconds: int | None = None
    points: int = 1

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def _resolve_images(self):
        if self.image_key:
            self.image_url = storage_service.presigned_get_url(self.image_key)
        self.options = [
            OptionOut(id=o["id"], text=o.get("text"),
                      image_url=storage_service.presigned_get_url(o["image_key"]) if o.get("image_key") else None)
            for o in (self.options_json or [])
        ]
        return self


class ImageUploadOut(BaseModel):
    """Response from uploading a question/option image — the admin UI
    embeds image_key into the question/option it belongs to and saves
    the whole question as usual; image_url is just for an immediate
    preview, it isn't stored anywhere."""
    image_key: str
    image_url: str | None

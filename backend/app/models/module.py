import enum
import uuid

from sqlalchemy import ARRAY, Boolean, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class QuestionType(str, enum.Enum):
    MCQ = "mcq"                  # single correct option out of 2+
    TRUE_FALSE = "true_false"    # MCQ with exactly two fixed options
    SHORT_ANSWER = "short_answer"  # free-text, matched against accepted_answers
    # "Picture quiz" isn't a separate type — an MCQ/TRUE_FALSE question (or
    # any of its options) can carry an image instead of, or alongside,
    # text; at least one of text/image is required on each. See
    # schemas/question.py's validators for the actual rule.


class ModuleType(str, enum.Enum):
    WATCH = "watch"    # video, completion gated on % watched
    READ = "read"      # document, completion gated on marking read
    QUIZ = "quiz"      # gated on minimum score — see ModuleQuizQuestion
    MANUAL = "manual"  # instructor sign-off, no automatic gate
    SCORM = "scorm"    # a real SCORM 1.2/2004 package, played in a sandboxed
                       # iframe; completion comes from the package's own JS
                       # API calls (cmi.core.lesson_status / completion_status),
                       # not a watched-% or a manual click — see learn_service.


class Module(Base):
    """
    A single unit inside a course. Completion rules that were originally
    speculated as a separate `module_rules` table (see that file's note)
    live directly on this row instead — threshold/required/skill_ids
    aren't a distinct "rule" concept, they're just this module's config,
    and splitting them out added a join for no real benefit.

    skill_ids / badge_ids are plain UUID arrays, not foreign keys, even
    though Skill and Badge tables exist now: Postgres can't put a real
    FK constraint on individual elements of an array column without a
    proper many-to-many join table, which felt like overkill for two
    tag-like relationships. Validated at the API layer instead — see
    courses.py's module create/update, which checks each id belongs
    to this org before saving.
    """
    __tablename__ = "modules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    type: Mapped[ModuleType] = mapped_column(default=ModuleType.WATCH)
    position: Mapped[int] = mapped_column(Integer, default=0)  # display order within the course
    required: Mapped[bool] = mapped_column(Boolean, default=True)
    threshold: Mapped[int] = mapped_column(Integer, default=90)  # min % watched (WATCH) or min score (QUIZ)

    # Retake control — currently only enforced for QUIZ modules (see
    # learn_service.submit_quiz). retake_enabled off means exactly one
    # attempt ever, pass or fail. On, retake_limit caps the TOTAL number
    # of attempts (first try included) a learner may make; null means
    # unlimited. A learner who already passed may keep attempting (up to
    # the limit) for a higher score — every attempt is kept in
    # QuizAttempt, but ModuleProgress.score only ever rises, never falls
    # (see learn_service._mark_done), so "the highest grade counts" falls
    # out of logic that already existed before this feature.
    #
    # New modules default retake_enabled=False (Python-side default,
    # applies to every ORM-created row) — a quiz is single-attempt unless
    # an admin turns retakes on. The migration that added this column
    # backfilled every *existing* module with retake_enabled=true /
    # retake_limit=null (via a server_default, not this Python default)
    # so no course already relying on the old "always allowed to retry a
    # failed quiz" behavior silently became single-attempt.
    retake_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    retake_limit: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # WATCH / READ content
    # file_url is never written directly anymore — it's recomputed from
    # file_key as a fresh presigned R2 URL every time a module is
    # serialized (see ModuleOut's model_validator in schemas/course.py),
    # since a stored signed URL would just expire. file_key is the
    # permanent, non-expiring object key and is what actually matters;
    # the column stays in case any pre-upload-feature row still has a
    # plain legacy URL in it.
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    file_size_label: Mapped[str | None] = mapped_column(String(20), nullable=True)  # display string e.g. "45.1 MB"

    # MANUAL content
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    # SCORM content — file_key is reused here as the package's *prefix*
    # (a folder, not a single object) under which every file the zip
    # contained was unpacked, since a SCORM package references its own
    # sibling assets by relative path and needs them all individually
    # fetchable, not one opaque zip blob.
    scorm_launch_path: Mapped[str | None] = mapped_column(String(500), nullable=True)
    scorm_version: Mapped[str | None] = mapped_column(String(20), nullable=True)  # "1.2" | "2004"

    # Cross-feature soft references
    skill_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    badge_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)

    # Module-level certificate — separate, lighter-weight from the course's own certificate.
    # certificate_template_id is a real FK now that CertTemplate exists.
    certificate_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    certificate_template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cert_templates.id"), nullable=True)
    certificate_name: Mapped[str | None] = mapped_column(String(300), nullable=True)

    # Per-module access conditions, on top of (and independent from) the
    # course-wide sequential_unlock ordering — see
    # learn_service.module_locked for how they're evaluated and
    # schemas/course.py's ModuleRestrictionIn for the shapes this holds:
    #   {"type": "date_window", "opens_at": "<iso>"|null, "closes_at": "<iso>"|null}
    #   {"type": "profile_field", "field": "country"|"location"|"job_title", "value": "<string>"}
    #   {"type": "module_score", "module_id": "<uuid str>", "min_score": <0-100>}
    # ALL entries must pass for the module to be reachable. Plain JSON,
    # not a join table, same reasoning as skill_ids/badge_ids above —
    # validated at the API layer, not here.
    restrictions: Mapped[list[dict]] = mapped_column(JSONB, default=list)

    # WATCH-only in-video-question gate, independent of `threshold` (the
    # min watched-%): when set, the module also requires at least this
    # many of its in-video questions (ModuleQuizQuestion rows with a
    # trigger_time_sec, see below) answered correctly. None/0 = no such
    # gate, only the watched-% threshold applies — see learn_service's
    # complete_module. Org-admin-configured per module.
    video_question_min_correct: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Draft/published gate — a brand-new module (add_module) is created
    # with this False so it never appears to a learner mid-authoring; it
    # flips to True the first time the admin explicitly saves it (see
    # update_module), or whenever they set it directly (an admin can also
    # un-publish an already-live module to pull it temporarily). Existing
    # rows from before this column existed default True via the DB-level
    # server_default, so nothing already-published silently disappears.
    # Only checked learner-side (get_my_course / ordered_modules /
    # _counted_modules) — the admin's own course-management view always
    # shows every module, draft or not.
    published: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"), nullable=False)

    course: Mapped["Course"] = relationship(back_populates="modules")
    # Same reasoning as Course.modules/category above — ModuleOut always
    # includes questions, so it must be loaded within the awaited query,
    # not lazily on synchronous attribute access.
    questions: Mapped[list["ModuleQuizQuestion"]] = relationship(
        back_populates="module", cascade="all, delete-orphan", order_by="ModuleQuizQuestion.position", lazy="selectin"
    )


class ModuleQuizQuestion(Base):
    """
    A single question authored for a QUIZ-type module. This is authoring
    content (what the admin wrote), not a learner's attempt at it —
    that's QuizAttempt (see progress.py), which only stores the overall
    score, not a per-question breakdown — recording that remains a gap.

    Shares its exact shape with BankQuestion (question_bank.py) — a
    question lives on a module (text/image + options JSON + correct
    answer) whether it was authored here directly or copied in from a
    question bank via question_bank_service.import_into_module. They're
    deliberately two tables, not one with a nullable module_id/bank_id,
    so a bank question's lifecycle (reusable, edited independently) never
    gets tangled with a module's live-editing/reordering/cascade-delete
    behavior.

    options_json / correct_option_id replaced the old options (plain
    string array) + correct_index (position in that array) columns —
    an option now needs its own stable id (since it may carry an image,
    reordering shouldn't silently reassign "the right answer" to a
    different option), text and/or image, independent of the others.
    """
    __tablename__ = "module_quiz_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    type: Mapped[QuestionType] = mapped_column(default=QuestionType.MCQ)
    # At least one of text/image_key is required — enforced at the API
    # layer (schemas/question.py), not the DB, since a plain CHECK
    # constraint can't see the image_key format easily and the app-level
    # error message is far more useful to an admin mid-authoring.
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # MCQ / TRUE_FALSE: list of {"id": str, "text": str|None, "image_key": str|None}
    options_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    correct_option_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # SHORT_ANSWER: matched case-insensitively against any entry
    accepted_answers: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    # In-video question placement, WATCH modules only (NULL for QUIZ
    # questions — they're ordered by `position`/shown all-at-once instead).
    # Seconds into the video's playback at which this question fires and
    # pauses it. Picture questions (image_key set, no text) are rejected
    # for WATCH modules at the API layer — see schemas/question.py.
    trigger_time_sec: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # How long the question stays on screen before auto-submit/skip, in
    # seconds. NULL = no timer — video stays paused until the learner
    # actually submits an answer (see learn_service's in-video-answer
    # handling for the submit-selected-else-skip-uncounted timeout rule).
    timer_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # Marks awarded for one correct answer to this question. Only
    # meaningful for WATCH in-video questions and QUIZ questions that
    # score by points rather than plain count — defaults to 1 so existing
    # QUIZ scoring (count-based) is unaffected unless an admin changes it.
    points: Mapped[int] = mapped_column(Integer, default=1)

    module: Mapped["Module"] = relationship(back_populates="questions")

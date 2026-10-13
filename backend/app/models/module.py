import enum
import uuid

from sqlalchemy import ARRAY, Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ModuleType(str, enum.Enum):
    WATCH = "watch"    # video, completion gated on % watched
    READ = "read"      # document, completion gated on marking read
    QUIZ = "quiz"      # gated on minimum score — see ModuleQuizQuestion
    MANUAL = "manual"  # instructor sign-off, no automatic gate


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

    # WATCH / READ content
    file_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    file_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    file_size_label: Mapped[str | None] = mapped_column(String(20), nullable=True)  # display string e.g. "45.1 MB"

    # MANUAL content
    instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Cross-feature soft references
    skill_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    badge_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)

    # Module-level certificate — separate, lighter-weight from the course's own certificate.
    # certificate_template_id is a real FK now that CertTemplate exists.
    certificate_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    certificate_template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cert_templates.id"), nullable=True)
    certificate_name: Mapped[str | None] = mapped_column(String(300), nullable=True)

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
    that's QUIZ_ATTEMPT, a separate and still-unbuilt table. Recording
    attempts is the single biggest documented gap in the whole skill/
    certificate/leaderboard pipeline; this table alone doesn't close it.
    """
    __tablename__ = "module_quiz_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    text: Mapped[str] = mapped_column(Text, nullable=False)
    options: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)
    correct_index: Mapped[int] = mapped_column(Integer, nullable=False)

    module: Mapped["Module"] = relationship(back_populates="questions")

import uuid
from datetime import datetime

from sqlalchemy import ARRAY, DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.module import QuestionType


class QuestionBank(Base):
    """
    A reusable pool of quiz questions, independent of any one course or
    module — built once, drawn from across many quizzes via
    question_bank_service.import_into_module, which copies selected
    questions into a module's own ModuleQuizQuestion rows. The copy is
    deliberate, not a live reference: editing a bank question later
    must never silently change a quiz a learner has already taken (or
    is about to).
    """
    __tablename__ = "question_banks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    questions: Mapped[list["BankQuestion"]] = relationship(
        back_populates="bank", cascade="all, delete-orphan", order_by="BankQuestion.position", lazy="selectin"
    )


class BankQuestion(Base):
    """Same shape as ModuleQuizQuestion — see that model's docstring for
    why they're separate tables rather than one with a nullable FK."""
    __tablename__ = "bank_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    bank_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("question_banks.id"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, default=0)

    type: Mapped[QuestionType] = mapped_column(default=QuestionType.MCQ)
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    image_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    options_json: Mapped[list[dict]] = mapped_column(JSONB, default=list)
    correct_option_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    accepted_answers: Mapped[list[str]] = mapped_column(ARRAY(String), default=list)

    bank: Mapped["QuestionBank"] = relationship(back_populates="questions")

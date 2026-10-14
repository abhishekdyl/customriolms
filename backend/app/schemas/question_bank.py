import uuid
from datetime import datetime

from pydantic import BaseModel

from app.schemas.question import QuestionIn, QuestionOut


class QuestionBankCreate(BaseModel):
    name: str
    description: str | None = None


class QuestionBankUpdate(BaseModel):
    name: str | None = None
    description: str | None = None


class QuestionBankListItem(BaseModel):
    """Lighter shape for the bank list view — no questions, just a count."""
    id: uuid.UUID
    name: str
    description: str | None
    question_count: int = 0
    created_at: datetime

    class Config:
        from_attributes = True


class QuestionBankOut(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    created_at: datetime
    questions: list[QuestionOut] = []

    class Config:
        from_attributes = True


class ImportQuestionsRequest(BaseModel):
    """Copies selected bank questions into a module's own question list —
    a copy, not a live reference (see BankQuestion's docstring): editing
    the bank question afterwards never changes a quiz already taken."""
    question_ids: list[uuid.UUID]

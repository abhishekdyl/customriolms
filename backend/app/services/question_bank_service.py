import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.module import Module, ModuleQuizQuestion, ModuleType
from app.models.question_bank import BankQuestion, QuestionBank
from app.schemas.question import QuestionIn


async def list_banks(db: AsyncSession, org_id: uuid.UUID) -> list[tuple[QuestionBank, int]]:
    result = await db.execute(
        select(QuestionBank, func.count(BankQuestion.id).label("question_count"))
        .outerjoin(BankQuestion, BankQuestion.bank_id == QuestionBank.id)
        .where(QuestionBank.org_id == org_id)
        .group_by(QuestionBank.id)
        .order_by(QuestionBank.name)
    )
    return list(result.all())


async def get_bank_or_404(db: AsyncSession, bank_id: uuid.UUID, org_id: uuid.UUID) -> QuestionBank:
    result = await db.execute(select(QuestionBank).where(QuestionBank.id == bank_id, QuestionBank.org_id == org_id))
    bank = result.scalar_one_or_none()
    if bank is None:
        raise HTTPException(status_code=404, detail="Question bank not found")
    return bank


async def create_bank(db: AsyncSession, org_id: uuid.UUID, name: str, description: str | None) -> QuestionBank:
    bank = QuestionBank(org_id=org_id, name=name, description=description)
    db.add(bank)
    await db.commit()
    await db.refresh(bank)
    return bank


async def update_bank(db: AsyncSession, bank: QuestionBank, name: str | None, description: str | None) -> QuestionBank:
    if name is not None:
        bank.name = name
    if description is not None:
        bank.description = description
    await db.commit()
    return bank


async def delete_bank(db: AsyncSession, bank: QuestionBank) -> None:
    await db.delete(bank)  # cascades to its questions
    await db.commit()


def _question_fields(q: QuestionIn) -> dict:
    return dict(
        type=q.type, text=q.text, image_key=q.image_key,
        options_json=[o.model_dump() for o in q.options],
        correct_option_id=q.correct_option_id, accepted_answers=q.accepted_answers,
    )


async def add_question(db: AsyncSession, bank: QuestionBank, body: QuestionIn) -> BankQuestion:
    max_position = max((q.position for q in bank.questions), default=-1)
    question = BankQuestion(bank_id=bank.id, position=max_position + 1, **_question_fields(body))
    db.add(question)
    await db.commit()
    await db.refresh(question)
    return question


async def import_aiken(db: AsyncSession, bank: QuestionBank, questions: list[QuestionIn]) -> int:
    """Writes every parsed Aiken question (see aiken_parser.parse_aiken)
    as a new BankQuestion at the end of the bank, in one commit. The
    parse step has already rejected the whole file if anything in it was
    malformed, so every question handed to this is already known-good —
    this never partially imports a bad file."""
    max_position = max((q.position for q in bank.questions), default=-1)
    for i, q in enumerate(questions):
        db.add(BankQuestion(bank_id=bank.id, position=max_position + 1 + i, **_question_fields(q)))
    await db.commit()
    await db.refresh(bank, attribute_names=["questions"])
    return len(questions)


async def get_bank_question_or_404(db: AsyncSession, bank_id: uuid.UUID, question_id: uuid.UUID) -> BankQuestion:
    result = await db.execute(
        select(BankQuestion).where(BankQuestion.id == question_id, BankQuestion.bank_id == bank_id)
    )
    question = result.scalar_one_or_none()
    if question is None:
        raise HTTPException(status_code=404, detail="Question not found in this bank")
    return question


async def update_question(db: AsyncSession, question: BankQuestion, body: QuestionIn) -> BankQuestion:
    for key, value in _question_fields(body).items():
        setattr(question, key, value)
    await db.commit()
    return question


async def delete_question(db: AsyncSession, question: BankQuestion) -> None:
    await db.delete(question)
    await db.commit()


async def import_into_module(db: AsyncSession, module: Module, bank: QuestionBank, question_ids: list[uuid.UUID]) -> Module:
    """Copies selected bank questions onto the end of a module's own
    question list. A copy, never a live reference — see BankQuestion's
    docstring for why editing the bank afterwards must not change a quiz
    a learner has already taken, or is mid-attempt on."""
    by_id = {q.id: q for q in bank.questions}
    missing = [qid for qid in question_ids if qid not in by_id]
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown question id(s) in this bank: {', '.join(str(m) for m in missing)}")

    if module.type == ModuleType.WATCH:
        picture = [qid for qid in question_ids if by_id[qid].image_key or any(o.get("image_key") for o in (by_id[qid].options_json or []))]
        if picture:
            raise HTTPException(status_code=400, detail="Picture questions can't be used in-video — deselect them to import the rest")

    max_position = max((q.position for q in module.questions), default=-1)
    for i, qid in enumerate(question_ids):
        src = by_id[qid]
        db.add(ModuleQuizQuestion(
            module_id=module.id, position=max_position + 1 + i,
            type=src.type, text=src.text, image_key=src.image_key,
            options_json=list(src.options_json or []),
            correct_option_id=src.correct_option_id, accepted_answers=list(src.accepted_answers or []),
        ))
    await db.commit()

    # expire_on_commit=False means `module` (already loaded earlier in this
    # request, with its questions relationship already populated as
    # whatever it was before this import) won't pick up the newly added
    # rows from a plain re-SELECT — the identity map just hands back the
    # same stale object. Explicitly refreshing the relationship is what
    # actually re-runs its selectin load.
    await db.refresh(module, attribute_names=["questions"])
    return module

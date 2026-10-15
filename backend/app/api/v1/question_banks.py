import uuid

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.models.user import RoleName, User
from app.schemas.question import ImageUploadOut, QuestionIn, QuestionOut
from app.schemas.question_bank import (
    ImportQuestionsRequest, QuestionBankCreate, QuestionBankListItem, QuestionBankOut, QuestionBankUpdate,
)
from app.schemas.course import ModuleOut
from app.services import question_bank_service as svc
from app.services import storage_service
from app.services.course_service import _get_module_with_questions, get_course_or_404

router = APIRouter(
    prefix="/api/v1/question-banks", tags=["question-banks"],
    dependencies=[Depends(require_role(RoleName.ORG_ADMIN))],
)


@router.get("", response_model=list[QuestionBankListItem])
async def list_banks(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    rows = await svc.list_banks(db, current_user.org_id)
    return [
        QuestionBankListItem(id=b.id, name=b.name, description=b.description, created_at=b.created_at, question_count=count)
        for b, count in rows
    ]


@router.post("", response_model=QuestionBankOut, status_code=201)
async def create_bank(body: QuestionBankCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    bank = await svc.create_bank(db, current_user.org_id, body.name, body.description)
    return bank


@router.get("/{bank_id}", response_model=QuestionBankOut)
async def get_bank(bank_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    return await svc.get_bank_or_404(db, bank_id, current_user.org_id)


@router.patch("/{bank_id}", response_model=QuestionBankOut)
async def update_bank(bank_id: uuid.UUID, body: QuestionBankUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    bank = await svc.get_bank_or_404(db, bank_id, current_user.org_id)
    return await svc.update_bank(db, bank, body.name, body.description)


@router.delete("/{bank_id}", status_code=204)
async def delete_bank(bank_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    bank = await svc.get_bank_or_404(db, bank_id, current_user.org_id)
    await svc.delete_bank(db, bank)


@router.post("/{bank_id}/questions", response_model=QuestionOut, status_code=201)
async def add_question(bank_id: uuid.UUID, body: QuestionIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    bank = await svc.get_bank_or_404(db, bank_id, current_user.org_id)
    return await svc.add_question(db, bank, body)


@router.patch("/{bank_id}/questions/{question_id}", response_model=QuestionOut)
async def update_question(
    bank_id: uuid.UUID, question_id: uuid.UUID, body: QuestionIn,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    await svc.get_bank_or_404(db, bank_id, current_user.org_id)  # ownership check
    question = await svc.get_bank_question_or_404(db, bank_id, question_id)
    return await svc.update_question(db, question, body)


@router.delete("/{bank_id}/questions/{question_id}", status_code=204)
async def delete_question(
    bank_id: uuid.UUID, question_id: uuid.UUID,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    await svc.get_bank_or_404(db, bank_id, current_user.org_id)
    question = await svc.get_bank_question_or_404(db, bank_id, question_id)
    await svc.delete_question(db, question)


@router.post("/{bank_id}/import-into/{course_id}/{module_id}", response_model=ModuleOut)
async def import_into_module(
    bank_id: uuid.UUID, course_id: uuid.UUID, module_id: uuid.UUID, body: ImportQuestionsRequest,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Copies the selected bank questions onto the end of this module's own
    question list — a copy, not a live link (see question_bank_service)."""
    bank = await svc.get_bank_or_404(db, bank_id, current_user.org_id)
    await get_course_or_404(db, course_id, current_user.org_id)  # ownership check
    module = await _get_module_with_questions(db, module_id)
    if module.course_id != course_id:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Module not found on this course")
    return await svc.import_into_module(db, module, bank, body.question_ids)


# ---------- Generic question/option image upload ----------
# Not nested under a bank or module — a question's image is uploaded once,
# up front, and its returned image_key is then embedded into whichever
# QuestionIn (bank question or module question) the admin is authoring.
@router.post("/images", response_model=ImageUploadOut, status_code=201)
async def upload_question_image(
    file: UploadFile = File(...), db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    storage_service.validate_image_upload(file, size)
    # No owning question exists yet at upload time (the image is attached
    # to a question/option afterward, client-side) — each upload is its
    # own independent slot, never replaced in place, so filepath is a
    # fresh id rather than a fixed "/" the way a module's one content
    # slot uses. Content is still deduped: the identical image used on
    # two different questions/options is written to storage once.
    record = await storage_service.store_file(
        db, file, org_id=current_user.org_id, component="question", filearea="image",
        itemid=None, filepath=uuid.uuid4().hex, user=current_user,
    )
    key = storage_service.file_key(record)
    return ImageUploadOut(image_key=key, image_url=storage_service.presigned_get_url(key))

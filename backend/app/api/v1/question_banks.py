import mimetypes
import uuid
import zipfile
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
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
from app.services.aiken_parser import AikenParseError, parse_aiken, required_image_refs
from app.services.aiken_sample import build_aiken_sample_zip
from app.services.course_service import _get_module_with_questions, get_course_or_404

# A plain-text file's root: no images possible. A .zip's root: the .txt
# with the questions, plus whatever image files sit alongside it in the
# same archive, referenced by filename from the .txt's IMAGE: lines (see
# aiken_parser.py). Any other extension is refused up front.
_TEXT_EXTS = (".txt", ".aiken")

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


@router.get("/aiken-sample.zip")
async def download_aiken_sample():
    """Demo file for the Aiken bulk-question importer below — one .txt
    covering every question type and both picture patterns (question-level
    and option-level), plus the placeholder images it references. Must stay
    registered before GET /{bank_id}: that route takes a single path segment
    too, and FastAPI/Starlette match routes in registration order, so a
    request for this fixed path would otherwise be caught there first and
    fail UUID coercion instead of reaching this route."""
    return Response(
        content=build_aiken_sample_zip(), media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="aiken-picture-questions-sample.zip"'},
    )


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


@router.post("/{bank_id}/import-aiken", response_model=QuestionBankOut)
async def import_aiken_file(
    bank_id: uuid.UUID, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Bulk-adds questions to this bank from an uploaded Aiken-format file —
    MCQ, True/False, short-answer, and picture questions/options all read
    from the same plain-text shape (see aiken_parser.parse_aiken). A plain
    .txt works as before for text-only questions; a .zip containing that
    .txt plus the image files its IMAGE: lines name is how pictures come
    along (see aiken_sample.py for a worked example of both). Either every
    question in the file imports, or none do — a malformed file, or a zip
    missing an image it references, is rejected with every problem found,
    not just the first, and nothing is uploaded or written until the whole
    file checks out."""
    bank = await svc.get_bank_or_404(db, bank_id, current_user.org_id)
    contents = await file.read()
    filename = (file.filename or "").lower()

    image_bytes: dict[str, bytes] = {}
    if filename.endswith(".zip"):
        try:
            zf = zipfile.ZipFile(BytesIO(contents))
        except zipfile.BadZipFile:
            raise HTTPException(status_code=400, detail="Couldn't read that as a .zip file")

        text = None
        with zf:
            for name in zf.namelist():
                if name.endswith("/"):
                    continue
                basename = name.rsplit("/", 1)[-1]
                if basename.lower().endswith(_TEXT_EXTS):
                    if text is not None:
                        raise HTTPException(status_code=400, detail="That .zip has more than one .txt/.aiken file — it needs exactly one")
                    try:
                        text = zf.read(name).decode("utf-8-sig")
                    except UnicodeDecodeError:
                        raise HTTPException(status_code=400, detail=f'Couldn\'t read "{basename}" as a plain text file')
                else:
                    image_bytes[basename.lower()] = zf.read(name)
        if text is None:
            raise HTTPException(status_code=400, detail="That .zip doesn't contain a .txt/.aiken file with the questions")
    elif filename.endswith(_TEXT_EXTS) or not filename:
        try:
            text = contents.decode("utf-8-sig")
        except UnicodeDecodeError:
            raise HTTPException(status_code=400, detail="Couldn't read that as a plain text file — save it as .txt, or as a .zip if it includes pictures")
    else:
        raise HTTPException(status_code=400, detail="Upload a .txt file (or a .zip if it includes pictures)")

    try:
        parsed = parse_aiken(text)
    except AikenParseError as e:
        raise HTTPException(status_code=400, detail=str(e))

    needed = required_image_refs(parsed)
    missing = sorted({ref for ref in needed if ref.lower() not in image_bytes})
    if missing:
        raise HTTPException(
            status_code=400,
            detail="These IMAGE: files are referenced in the text but weren't found in the .zip: " + ", ".join(missing),
        )

    # Upload every referenced image before resolving any question, so a bad
    # image (wrong type, too large) is caught — and nothing written — before
    # any question is saved either.
    image_keys: dict[str, str] = {}
    for ref in needed:
        key = ref.lower()
        data = image_bytes[key]
        storage_service.validate_image_bytes(ref, len(data))
        record = await storage_service.store_bytes(
            db, data, org_id=current_user.org_id, component="question", filearea="image",
            itemid=None, filename=ref, filepath=uuid.uuid4().hex, content_type=mimetypes.guess_type(ref)[0],
            user=current_user,
        )
        image_keys[key] = storage_service.file_key(record)
    if needed:
        await db.commit()  # store_bytes only flushes; same rule as store_file above

    questions = [pq.resolve(image_keys) for pq in parsed]
    await svc.import_aiken(db, bank, questions)
    return bank


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
    # store_file only flushes (see storage_service._upsert_file_row) — the
    # caller owns the commit. Without this, the `files` row (and any GC it
    # triggered) rolls back when this request's session closes, same bug
    # just fixed in course_service.remove_module_content.
    await db.commit()
    key = storage_service.file_key(record)
    return ImageUploadOut(image_key=key, image_url=storage_service.presigned_get_url(key))

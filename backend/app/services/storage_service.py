"""
Object storage for module content (video/PDF/DOC uploads, quiz/option
images, and SCORM packages) — two interchangeable backends behind one
set of module-level functions, so nothing outside this file ever
branches on which is active:

- Local disk (the fallback, used whenever R2_ENDPOINT_URL is empty):
  files land under STORAGE_ROOT (default <repo root>/riolmsdata, a
  sibling of backend/ and frontend/) and are served back out through
  GET /api/v1/files/{key} (app/api/v1/files.py). Zero setup — this is
  what a fresh clone gets with no .env object-storage config at all.
- Cloudflare R2 / any S3-compatible endpoint, used once an admin sets
  R2_ENDPOINT_URL (+ the access keys). Still a thin boto3 wrapper same
  as before; pointed at a local MinIO/moto endpoint in tests it talks
  to that instead, same code path either way.

A module's "file_url" is never a stored, permanent link either way —
it's rebuilt fresh every time the module is serialized (see ModuleOut's
model_validator in schemas/course.py): a short-lived presigned GET URL
on R2, or the local file-serving URL on disk storage. What *is*
permanent is the object key, stored on Module.file_key.

Every upload also lands in the `files` table (app/models/file.py) — a
Moodle-style content-addressed registry. store_file()/store_bytes()
below hash the upload (sha256) and write the physical blob under a
deterministic filedir/xx/yy/<hash> key; if that exact content is
already on disk/R2 (an identical video re-uploaded, a shared image used
on two questions, ...) the write is skipped entirely — the `files` row
still gets created/updated, but riolmsdata never grows a duplicate
copy. delete_file_ref() is the matching cleanup: it only removes the
physical blob once no other `files` row references that same
contenthash, so dropping one use of a shared file never breaks another.
"""
import hashlib
import mimetypes
import shutil
import tempfile
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.file import FileRecord

# type -> (allowed content-types/extensions, max size in bytes)
_VIDEO_TYPES = {"video/mp4", "video/webm", "video/quicktime", "video/x-matroska"}
_VIDEO_EXTS = {".mp4", ".webm", ".mov", ".mkv"}
_DOC_TYPES = {
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
_DOC_EXTS = {".pdf", ".doc", ".docx", ".ppt", ".pptx"}

MAX_VIDEO_BYTES = 500 * 1024 * 1024   # 500 MB
MAX_DOC_BYTES = 50 * 1024 * 1024      # 50 MB
MAX_SCORM_ZIP_BYTES = 300 * 1024 * 1024  # 300 MB, pre-unpack

_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
MAX_IMAGE_BYTES = 10 * 1024 * 1024    # 10 MB — a quiz question/option image, not a video frame


@dataclass
class UploadLimits:
    allowed_exts: set[str]
    allowed_content_types: set[str]
    max_bytes: int


def limits_for_module_type(module_type: str) -> UploadLimits:
    """module_type is the ModuleType value ("watch" -> video, "read" -> document)."""
    if module_type == "watch":
        return UploadLimits(_VIDEO_EXTS, _VIDEO_TYPES, MAX_VIDEO_BYTES)
    if module_type == "read":
        return UploadLimits(_DOC_EXTS, _DOC_TYPES, MAX_DOC_BYTES)
    raise HTTPException(status_code=400, detail="This module type doesn't accept a file upload")


def _using_s3() -> bool:
    return bool(settings.R2_ENDPOINT_URL)


def _client():
    return boto3.client(
        "s3",
        endpoint_url=settings.R2_ENDPOINT_URL,
        aws_access_key_id=settings.R2_ACCESS_KEY_ID,
        aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
        region_name="auto",
        # R2 (and most S3-compatible servers used in tests) need
        # path-style addressing — virtual-hosted-style buckets are an
        # AWS-specific convention their DNS doesn't support.
        config=BotoConfig(s3={"addressing_style": "path"}, signature_version="s3v4"),
    )


def _local_root() -> Path:
    """<repo root>/riolmsdata by default — a sibling of backend/ and
    frontend/, not inside either, so it survives a `rm -rf` of either
    folder and is easy to find/back up/point a volume mount at.
    STORAGE_ROOT overrides this (absolute or relative to the backend's
    working directory) if an admin wants it somewhere else."""
    if settings.STORAGE_ROOT:
        root = Path(settings.STORAGE_ROOT).expanduser()
    else:
        # this file is backend/app/services/storage_service.py, so
        # parents[2] = backend/, parents[3] = backend/'s parent = repo root.
        repo_root = Path(__file__).resolve().parents[3]
        root = repo_root / "riolmsdata"
    root.mkdir(parents=True, exist_ok=True)
    return root


def _local_path(key: str) -> Path:
    # Keys are always forward-slash object paths (content-addressed —
    # see _content_key — never from raw user input), so this never
    # escapes _local_root() via ".." the way a user-supplied path could.
    return _local_root() / key


def validate_upload(file: UploadFile, module_type: str, size: int) -> UploadLimits:
    limits = limits_for_module_type(module_type)
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if ext not in limits.allowed_exts and content_type not in limits.allowed_content_types:
        raise HTTPException(status_code=400, detail=f"Unsupported file type for this module ({ext or content_type or 'unknown'})")
    if size > limits.max_bytes:
        raise HTTPException(status_code=400, detail=f"File is too large — max {limits.max_bytes // (1024 * 1024)} MB for this module type")
    return limits


def validate_image_upload(file: UploadFile, size: int) -> None:
    """For a quiz question/option image — a different, much smaller
    limit and type set than a module's own video/doc upload."""
    ext = "." + file.filename.rsplit(".", 1)[-1].lower() if file.filename and "." in file.filename else ""
    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if ext not in _IMAGE_EXTS and content_type not in _IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unsupported image type ({ext or content_type or 'unknown'}) — use JPG, PNG, WEBP or GIF")
    if size > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail=f"Image is too large — max {MAX_IMAGE_BYTES // (1024 * 1024)} MB")


def validate_image_bytes(filename: str, size: int) -> None:
    """Same rule as validate_image_upload, for raw bytes that didn't
    arrive as an UploadFile — e.g. one image pulled out of a .zip during
    a bulk Aiken-with-pictures import (see aiken_parser.py)."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    content_type = mimetypes.guess_type(filename)[0] or ""
    if ext not in _IMAGE_EXTS and content_type not in _IMAGE_TYPES:
        raise HTTPException(status_code=400, detail=f'Unsupported image type for "{filename}" ({ext or content_type or "unknown"}) — use JPG, PNG, WEBP or GIF')
    if size > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=400, detail=f'"{filename}" is too large — max {MAX_IMAGE_BYTES // (1024 * 1024)} MB')


def size_label(num_bytes: int) -> str:
    mb = num_bytes / 1_000_000
    if mb >= 1:
        return f"{mb:.1f} MB"
    return f"{num_bytes / 1_000:.0f} KB"


def delete_object(key: str) -> None:
    """Best-effort — a failed delete here shouldn't block removing the module's reference to it."""
    if not _using_s3():
        _local_path(key).unlink(missing_ok=True)
        return
    try:
        _client().delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
    except (BotoCoreError, ClientError, HTTPException):
        pass


def get_bytes(key: str) -> bytes | None:
    if not _using_s3():
        path = _local_path(key)
        try:
            return path.read_bytes()
        except OSError:
            return None
    try:
        obj = _client().get_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
        return obj["Body"].read()
    except (BotoCoreError, ClientError):
        return None


def presigned_get_url(key: str, expires_in: int = 3600) -> str | None:
    if not key:
        return None
    if not _using_s3():
        # No real presigning for local disk — just a stable URL to the
        # file-serving route (app/api/v1/files.py). Unlike an R2 presigned
        # URL this doesn't expire; the key itself (a random UUID path) is
        # what keeps it from being guessable, same trust model a short
        # S3 presigned URL has, minus the expiry.
        base = settings.PUBLIC_API_BASE_URL.rstrip("/")
        return f"{base}/api/v1/files/{quote(key)}"
    try:
        return _client().generate_presigned_url(
            "get_object", Params={"Bucket": settings.R2_BUCKET_NAME, "Key": key}, ExpiresIn=expires_in,
        )
    except (BotoCoreError, ClientError, HTTPException):
        # Don't 500 a whole course page just because a presign call failed —
        # the module shows up with no playable file link, which is visible
        # and debuggable, instead of taking down the request.
        return None


def ensure_bucket() -> None:
    """Idempotent setup call for whichever backend is active: creates the
    local storage root, or (R2/S3) the configured bucket if it doesn't
    exist yet. Real R2 buckets are normally created once by hand in the
    dashboard, so the R2 branch here only matters for spinning up a
    fresh local/test S3-compatible server.
    create_bucket is called with region_name="us-east-1" specifically —
    that's the one region the S3 API lets you create a bucket on without
    a LocationConstraint, which "auto" (R2's own region) isn't a real
    value for; R2 itself ignores this entirely since its buckets are
    created in its dashboard, not through this call."""
    if not _using_s3():
        _local_root()
        return
    client = _client()
    try:
        client.head_bucket(Bucket=settings.R2_BUCKET_NAME)
    except (BotoCoreError, ClientError):
        test_client = boto3.client(
            "s3", endpoint_url=settings.R2_ENDPOINT_URL,
            aws_access_key_id=settings.R2_ACCESS_KEY_ID, aws_secret_access_key=settings.R2_SECRET_ACCESS_KEY,
            region_name="us-east-1", config=BotoConfig(s3={"addressing_style": "path"}),
        )
        test_client.create_bucket(Bucket=settings.R2_BUCKET_NAME)


# ---------- content-addressed storage + the `files` dedup ledger ----------
def _content_key(contenthash: str) -> str:
    # filedir/xx/yy/<hash> — the exact layout Moodle's own dataroot uses,
    # fanned out two levels so one folder never ends up with millions of
    # entries. Deterministic: the same bytes always land at the same key,
    # which IS the dedup mechanism at the storage layer — a second upload
    # of identical content resolves to a key that's already there.
    return f"filedir/{contenthash[:2]}/{contenthash[2:4]}/{contenthash}"


def _object_exists(key: str) -> bool:
    if not _using_s3():
        return _local_path(key).exists()
    try:
        _client().head_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
        return True
    except (BotoCoreError, ClientError):
        return False


def _put_path_at_key(key: str, local_path: Path, content_type: str | None) -> None:
    """Writes local_path's bytes to `key`, but only if nothing's there
    yet — the caller already looked up whether this exact content hash
    exists; this just does the actual (possibly skipped) write."""
    if _object_exists(key):
        return
    if not _using_s3():
        dest = _local_path(key)
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(local_path, dest)
        return
    client = _client()
    try:
        client.upload_file(
            str(local_path), settings.R2_BUCKET_NAME, key,
            ExtraArgs={"ContentType": content_type} if content_type else {},
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"Upload to object storage failed: {exc}") from exc


def _hash_and_store_fileobj(file: UploadFile) -> tuple[str, int, str | None]:
    """Streams an UploadFile to a temp file while hashing it (so a 500MB
    video is never fully buffered in memory), writes it to its
    content-addressed key (skipped if that content's already stored),
    and returns (contenthash, size, content_type)."""
    file.file.seek(0)
    hasher = hashlib.sha256()
    size = 0
    with tempfile.NamedTemporaryFile(delete=False) as tmp:
        tmp_path = Path(tmp.name)
        while True:
            chunk = file.file.read(1024 * 1024)
            if not chunk:
                break
            hasher.update(chunk)
            size += len(chunk)
            tmp.write(chunk)
    try:
        contenthash = hasher.hexdigest()
        _put_path_at_key(_content_key(contenthash), tmp_path, file.content_type)
    finally:
        tmp_path.unlink(missing_ok=True)
    file.file.seek(0)
    return contenthash, size, file.content_type


def _hash_and_store_bytes(data: bytes, content_type: str | None) -> tuple[str, int]:
    """Same as _hash_and_store_fileobj but for in-memory bytes — used by
    scorm_service, which already has each unpacked file's bytes in hand
    from the opened zip."""
    contenthash = hashlib.sha256(data).hexdigest()
    key = _content_key(contenthash)
    if not _object_exists(key):
        if not _using_s3():
            path = _local_path(key)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        else:
            client = _client()
            try:
                client.put_object(
                    Bucket=settings.R2_BUCKET_NAME, Key=key, Body=data,
                    **({"ContentType": content_type} if content_type else {}),
                )
            except (BotoCoreError, ClientError) as exc:
                raise HTTPException(status_code=502, detail=f"Upload to object storage failed: {exc}") from exc
    return contenthash, len(data)


async def _gc_if_orphaned(db: AsyncSession, contenthash: str) -> None:
    """Deletes the physical blob for `contenthash` only if no `files` row
    references it anymore — called after a row is removed/replaced, so a
    file still shared by another module/question/avatar is never pulled
    out from under it just because one of its uses went away."""
    remaining = (await db.execute(select(func.count()).where(FileRecord.contenthash == contenthash))).scalar_one()
    if remaining == 0:
        delete_object(_content_key(contenthash))


def _pathnamehash(component: str, filearea: str, itemid: uuid.UUID | None, filepath: str) -> str:
    # Deliberately NOT filename — filename is free to change when a slot's
    # content is replaced (e.g. re-uploading a module's video under a
    # different filename must still update the SAME row, not orphan the
    # old one). filepath is what actually discriminates slots: "/" for a
    # single-file slot (a module's own content, an avatar), a fresh
    # uuid4 per call for an independent upload with no replace semantics
    # (a question image), or the file's own relative path for one entry
    # inside a multi-file slot (a SCORM package, see scorm_service).
    raw = f"{component}/{filearea}/{itemid or ''}/{filepath}"
    return hashlib.sha256(raw.encode()).hexdigest()


async def _upsert_file_row(
    db: AsyncSession, *, org_id: uuid.UUID, component: str, filearea: str, itemid: uuid.UUID | None,
    filepath: str, filename: str, contenthash: str, size: int, mimetype: str | None,
    user_id: uuid.UUID | None, user_name: str | None,
) -> FileRecord:
    pathnamehash = _pathnamehash(component, filearea, itemid, filepath)
    existing = (await db.execute(select(FileRecord).where(FileRecord.pathnamehash == pathnamehash))).scalar_one_or_none()
    old_contenthash = existing.contenthash if existing else None

    row = existing or FileRecord(
        org_id=org_id, pathnamehash=pathnamehash, component=component, filearea=filearea,
        itemid=itemid, filepath=filepath,
    )
    row.filename = filename
    row.contenthash = contenthash
    row.filesize = size
    row.mimetype = mimetype
    row.userid = user_id
    row.author = user_name
    if existing is None:
        db.add(row)
    await db.flush()

    if old_contenthash and old_contenthash != contenthash:
        await _gc_if_orphaned(db, old_contenthash)

    return row


async def store_file(
    db: AsyncSession, file: UploadFile, *, org_id: uuid.UUID, component: str, filearea: str,
    itemid: uuid.UUID | None, user=None, filepath: str = "/", filename: str | None = None,
) -> FileRecord:
    """The main entry point for an UploadFile-backed upload (a module's
    video/doc, a question image, an avatar, ...). Hashes + content-
    addresses the bytes (real dedup — identical content is written to
    storage once no matter how many times it's uploaded) and upserts the
    `files` row for this exact (component, filearea, itemid, filepath,
    filename) slot. The caller still stores the plain object key
    (FileRecord's own `key` property) in its own file_key/image_key
    column, same as before this table existed — this just adds the
    ledger and the dedup underneath."""
    name = filename or file.filename or "file"
    contenthash, size, content_type = _hash_and_store_fileobj(file)
    return await _upsert_file_row(
        db, org_id=org_id, component=component, filearea=filearea, itemid=itemid,
        filepath=filepath, filename=name, contenthash=contenthash, size=size, mimetype=content_type,
        user_id=getattr(user, "id", None), user_name=getattr(user, "full_name", None),
    )


async def store_bytes(
    db: AsyncSession, data: bytes, *, org_id: uuid.UUID, component: str, filearea: str,
    itemid: uuid.UUID | None, filename: str, filepath: str = "/", content_type: str | None = None, user=None,
) -> FileRecord:
    """Same as store_file but for in-memory bytes — scorm_service's per-
    entry unpack loop is the caller, since it already has each file's
    bytes from the opened zip rather than an UploadFile per entry."""
    contenthash, size = _hash_and_store_bytes(data, content_type)
    return await _upsert_file_row(
        db, org_id=org_id, component=component, filearea=filearea, itemid=itemid,
        filepath=filepath, filename=filename, contenthash=contenthash, size=size, mimetype=content_type,
        user_id=getattr(user, "id", None), user_name=getattr(user, "full_name", None),
    )


async def find_file(db: AsyncSession, *, component: str, filearea: str, itemid: uuid.UUID | None, filepath: str) -> FileRecord | None:
    """Looks up one slot's current row directly — used where there's no
    other column to hold the key (a SCORM package's hundreds of files
    aren't each getting their own Module column; the `files` table IS
    the index for "which content is at this relative path")."""
    pathnamehash = _pathnamehash(component, filearea, itemid, filepath)
    return (await db.execute(select(FileRecord).where(FileRecord.pathnamehash == pathnamehash))).scalar_one_or_none()


def file_key(record: FileRecord) -> str:
    """The plain object-storage key for a `files` row's content — what
    callers store in their own file_key/image_key column and pass to
    presigned_get_url/get_bytes exactly as they did before this table
    existed."""
    return _content_key(record.contenthash)


async def list_slot_paths(db: AsyncSession, *, component: str, filearea: str, itemid: uuid.UUID | None) -> set[str]:
    """Every filepath currently recorded for this (component, filearea,
    itemid) — used by a multi-file owner (SCORM's unpack loop) to work
    out which of the PREVIOUS package's files the new upload no longer
    has, so those specific rows/blobs get cleaned up rather than left
    behind as orphans from the old package."""
    rows = (await db.execute(
        select(FileRecord.filepath).where(FileRecord.component == component, FileRecord.filearea == filearea, FileRecord.itemid == itemid)
    )).scalars().all()
    return set(rows)


async def delete_file_ref_at(db: AsyncSession, *, component: str, filearea: str, itemid: uuid.UUID | None, filepath: str) -> None:
    """Removes the one row at this exact slot (not every row for the
    itemid — see delete_file_ref for that) and GCs its blob if orphaned."""
    pathnamehash = _pathnamehash(component, filearea, itemid, filepath)
    row = (await db.execute(select(FileRecord).where(FileRecord.pathnamehash == pathnamehash))).scalar_one_or_none()
    if row is None:
        return
    h = row.contenthash
    await db.delete(row)
    await db.flush()
    await _gc_if_orphaned(db, h)


async def delete_file_ref(db: AsyncSession, *, component: str, filearea: str, itemid: uuid.UUID | None) -> None:
    """Removes every `files` row for this (component, filearea, itemid) —
    e.g. a module's content being replaced/removed — and garbage-collects
    each row's physical blob, but only where no other row anywhere still
    references that same contenthash (the whole point of dedup: deleting
    one use must never break a different module/question/avatar that
    happens to share the identical bytes)."""
    rows = (await db.execute(
        select(FileRecord).where(FileRecord.component == component, FileRecord.filearea == filearea, FileRecord.itemid == itemid)
    )).scalars().all()
    hashes = {r.contenthash for r in rows}
    for row in rows:
        await db.delete(row)
    await db.flush()
    for h in hashes:
        await _gc_if_orphaned(db, h)

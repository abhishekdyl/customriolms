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
"""
import mimetypes
import shutil
import uuid
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import quote

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import HTTPException, UploadFile

from app.core.config import settings

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
    # Keys are always forward-slash object paths (built by build_key /
    # build_image_key / scorm_service, never from raw user input), so this
    # never escapes _local_root() via ".." the way a user-supplied path could.
    return _local_root() / key


def build_key(module_id: uuid.UUID, filename: str) -> str:
    safe_name = filename.replace("/", "_").replace("\\", "_")
    return f"modules/{module_id}/{uuid.uuid4().hex}_{safe_name}"


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


def build_image_key(org_id: uuid.UUID, filename: str) -> str:
    safe_name = (filename or "image").replace("/", "_").replace("\\", "_")
    return f"question-images/{org_id}/{uuid.uuid4().hex}_{safe_name}"


def size_label(num_bytes: int) -> str:
    mb = num_bytes / 1_000_000
    if mb >= 1:
        return f"{mb:.1f} MB"
    return f"{num_bytes / 1_000:.0f} KB"


def upload_fileobj(key: str, file: UploadFile) -> None:
    if not _using_s3():
        path = _local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as out:
            shutil.copyfileobj(file.file, out)
        return
    client = _client()
    try:
        client.upload_fileobj(
            file.file, settings.R2_BUCKET_NAME, key,
            ExtraArgs={"ContentType": file.content_type} if file.content_type else {},
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"Upload to object storage failed: {exc}") from exc


def delete_object(key: str) -> None:
    """Best-effort — a failed delete here shouldn't block removing the module's reference to it."""
    if not _using_s3():
        _local_path(key).unlink(missing_ok=True)
        return
    try:
        _client().delete_object(Bucket=settings.R2_BUCKET_NAME, Key=key)
    except (BotoCoreError, ClientError, HTTPException):
        pass


def upload_bytes(key: str, data: bytes, content_type: str | None = None) -> None:
    if not _using_s3():
        path = _local_path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
        return
    client = _client()
    try:
        client.put_object(
            Bucket=settings.R2_BUCKET_NAME, Key=key, Body=data,
            **({"ContentType": content_type} if content_type else {}),
        )
    except (BotoCoreError, ClientError) as exc:
        raise HTTPException(status_code=502, detail=f"Upload to object storage failed: {exc}") from exc


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


def delete_prefix(prefix: str) -> None:
    """Best-effort delete of every object under a SCORM package's folder —
    used when a module's package is replaced or removed, so storage
    doesn't quietly accumulate a full orphaned copy on every re-upload."""
    if not _using_s3():
        shutil.rmtree(_local_path(prefix), ignore_errors=True)
        return
    try:
        client = _client()
        paginator = client.get_paginator("list_objects_v2")
        for page in paginator.paginate(Bucket=settings.R2_BUCKET_NAME, Prefix=prefix):
            keys = [{"Key": o["Key"]} for o in page.get("Contents", [])]
            if keys:
                client.delete_objects(Bucket=settings.R2_BUCKET_NAME, Delete={"Objects": keys})
    except (BotoCoreError, ClientError, HTTPException):
        pass


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

import mimetypes

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response

from app.services import storage_service

router = APIRouter(prefix="/api/v1/files", tags=["files"])


@router.get("/{key:path}")
async def get_file(key: str):
    """Serves one object out of local disk storage (storage_service.py's
    fallback backend, active whenever R2_ENDPOINT_URL is unset) by its
    key. This route only ever gets hit while local storage is active —
    with R2 configured, presigned_get_url() hands back a real R2 URL
    instead and nothing points here.

    Not auth-gated: a key is an unguessable random-UUID path (see
    build_key/build_image_key/scorm_service), the same trust model as a
    short-lived S3 presigned URL — anyone with the link can view it —
    just without an expiry. That's an acceptable floor for the
    zero-setup local fallback; configure R2 for real expiring links.
    """
    data = storage_service.get_bytes(key)
    if data is None:
        raise HTTPException(status_code=404, detail="File not found")
    content_type = mimetypes.guess_type(key)[0] or "application/octet-stream"
    return Response(content=data, media_type=content_type)

import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.certificate import CertSize


class CertTemplateCreate(BaseModel):
    name: str
    size: CertSize = CertSize.LANDSCAPE
    accent_color: str = "#3D5AFE"
    show_header: bool = True
    header_text: str = "CERTIFICATE OF COMPLETION"
    fields: dict = {}
    field_positions: dict = {}
    field_font_sizes: dict = {}


class CertTemplateUpdate(BaseModel):
    name: str | None = None
    background_url: str | None = None
    size: CertSize | None = None
    accent_color: str | None = None
    show_header: bool | None = None
    header_text: str | None = None
    fields: dict | None = None
    field_positions: dict | None = None
    field_font_sizes: dict | None = None


class CertTemplateOut(BaseModel):
    id: uuid.UUID
    name: str
    background_url: str | None
    size: CertSize
    accent_color: str
    show_header: bool
    header_text: str
    fields: dict
    field_positions: dict
    field_font_sizes: dict

    class Config:
        from_attributes = True


class CertificateIssueRequest(BaseModel):
    user_id: uuid.UUID
    course_id: uuid.UUID
    template_id: uuid.UUID | None = None


class CertificateOut(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    learner_name: str | None = None    # populated by the service via the join
    course_id: uuid.UUID
    course_title: str | None = None    # populated by the service via the join
    template_id: uuid.UUID | None
    code: str
    issued_at: datetime

    class Config:
        from_attributes = True

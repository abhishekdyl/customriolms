import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Trigger = Literal["before_due", "on_due", "overdue", "weekly_digest"]
Channel = Literal["email", "inapp", "push"]


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    subject: str = Field(min_length=1, max_length=300)
    body: str


class TemplateOut(TemplateIn):
    id: uuid.UUID
    editable: bool

    class Config:
        from_attributes = True


class RuleIn(BaseModel):
    trigger: Trigger
    days: int = Field(default=0, ge=0, le=365)
    channels: list[Channel] = []
    enabled: bool = True


class RuleOut(RuleIn):
    id: uuid.UUID

    class Config:
        from_attributes = True


class SmtpIn(BaseModel):
    use_custom: bool = False
    host: str = ""
    port: int = Field(default=587, ge=1, le=65535)
    encryption: Literal["TLS", "SSL", "None"] = "TLS"
    username: str = ""
    password: str | None = None  # None = keep the stored password
    from_name: str = ""
    from_email: str = ""


FallbackStatus = Literal["none", "requested", "approved", "denied"]


class SmtpOut(BaseModel):
    use_custom: bool
    host: str
    port: int
    encryption: str
    username: str
    has_password: bool
    from_name: str
    from_email: str
    fallback_status: FallbackStatus


class SmtpTestResult(BaseModel):
    ok: bool
    detail: str


class PlatformSmtpIn(BaseModel):
    host: str = ""
    port: int = Field(default=587, ge=1, le=65535)
    encryption: Literal["TLS", "SSL", "None"] = "TLS"
    username: str = ""
    password: str | None = None  # None = keep the stored password
    from_name: str = ""
    from_email: str = ""


class PlatformSmtpOut(BaseModel):
    host: str
    port: int
    encryption: str
    username: str
    has_password: bool
    from_name: str
    from_email: str


class OrgFallbackRequestOut(BaseModel):
    org_id: uuid.UUID
    org_name: str
    status: FallbackStatus
    requested_at: datetime | None = None
    decided_at: datetime | None = None

    class Config:
        from_attributes = True


class EmailLogOut(BaseModel):
    id: uuid.UUID
    to_addr: str
    subject: str
    source: Literal["org", "platform", "none"]
    status: Literal["sent", "failed", "skipped"]
    detail: str
    created_at: datetime

    class Config:
        from_attributes = True


class PlatformEmailLogOut(EmailLogOut):
    org_id: uuid.UUID
    org_name: str

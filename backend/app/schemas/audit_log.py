import uuid
from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: uuid.UUID
    actor_name: str
    action: str
    entity_type: str
    entity_id: uuid.UUID | None
    entity_label: str
    detail: str
    course_id: uuid.UUID | None = None
    created_at: datetime

    class Config:
        from_attributes = True

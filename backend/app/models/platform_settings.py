import uuid

from sqlalchemy import Boolean
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

SINGLETON_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class PlatformSettings(Base):
    """
    Exactly one row ever exists (id is a fixed constant — see
    SINGLETON_ID). Platform-wide switches that aren't tied to any one
    org live here, e.g. whether the public /register form is open at
    all. Super-admin only.
    """
    __tablename__ = "platform_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=lambda: SINGLETON_ID)
    allow_self_serve_signup: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

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
    # Locks every non-Super-Admin out of the API (see deps._validate_token)
    # and shows them a maintenance page instead — Super Admin can keep
    # working (and log in) the whole time. Site-wide, not per-org.
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Moodle-style developer debug mode: while on, an unhandled server
    # error returns its real exception detail instead of a generic
    # message (see main.py's exception handler), and the frontend shows
    # it — plus any failed request — in a banner above the page header.
    # Meant to be switched on briefly while chasing an issue, not left on.
    debug_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

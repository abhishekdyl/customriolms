import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Category(Base):
    """
    A tag applied to courses (Compliance, Technical, Leadership, ...).
    Deleting a category doesn't touch the courses that used it — see
    the service layer: their tag falls back to "Uncategorized" rather
    than leaving a dangling reference or cascading a delete nobody asked for.
    """
    __tablename__ = "categories"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    color: Mapped[str] = mapped_column(String(7), default="#3D5AFE")  # hex, matches the admin UI's color-picker

    org: Mapped["Org"] = relationship()

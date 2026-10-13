import uuid

from sqlalchemy import ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Skill(Base):
    """
    A tag a module can build (Safety, Data Privacy, Leadership, ...).
    Not in the original architecture doc — Recognition (Skills/Badges/
    Certificates) was designed organically during the lms_screens.jsx
    mockup work, not scoped up front. Added here as its own file rather
    than folded into an existing one, matching the one-file-per-entity
    convention everywhere else.

    Module.skill_ids stores this id in a plain array (see module.py's
    note on soft references) — deleting a skill here does NOT cascade
    to modules automatically; the service layer strips the id from any
    module still holding it, same "don't leave a dangling reference"
    principle as Category's delete.
    """
    __tablename__ = "skills"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)

    org: Mapped["Org"] = relationship()

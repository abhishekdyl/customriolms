import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ModuleAttemptOverride(Base):
    """A per-(module, learner) exception to the module's own retake_limit
    — "give THIS learner N extra attempts" without touching the module's
    setting for everyone else. extra_attempts is added on top of whatever
    the module's normal cap resolves to for that learner (see
    learn_service._retake_gate); it has no effect on a module that's
    already unlimited, and it still applies even when the module's
    retake_enabled is off (an admin granting someone an explicit
    exception is deliberately independent of the general policy).

    One row per (module_id, user_id) — a later grant replaces the stored
    value rather than stacking rows, so "set this learner's extra
    attempts to 2" is idempotent and an admin can freely re-set it
    (including back down, or to 0 to revoke) rather than only ever being
    able to add more."""
    __tablename__ = "module_attempt_overrides"
    __table_args__ = (UniqueConstraint("module_id", "user_id", name="uq_attempt_override_module_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    module_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    extra_attempts: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

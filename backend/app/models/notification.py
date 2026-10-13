import uuid
from datetime import datetime, timezone

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class NotificationTemplate(Base):
    """Email template an org's reminder/invite emails are rendered from.
    {{learner_name}}-style variables are filled in per recipient at send time."""
    __tablename__ = "notification_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # System templates (e.g. Welcome invite) can be edited but not deleted.
    editable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ReminderRule(Base):
    """When a reminder fires (relative to a course due date) and over which channels."""
    __tablename__ = "reminder_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    trigger: Mapped[str] = mapped_column(String(30), nullable=False)  # before_due | on_due | overdue | weekly_digest
    days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    channels: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)  # email | inapp | push
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class OrgSmtpSettings(Base):
    """One row per org, only when the org opts into its own mail server."""
    __tablename__ = "org_smtp_settings"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), primary_key=True)
    use_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    host: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=587, nullable=False)
    encryption: Mapped[str] = mapped_column(String(10), default="TLS", nullable=False)  # TLS | SSL | None
    username: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    # NOTE: stored as plain text for now — encrypt at rest (e.g. Fernet with a server key) before production.
    password: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    from_name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    from_email: Mapped[str] = mapped_column(String(255), default="", nullable=False)

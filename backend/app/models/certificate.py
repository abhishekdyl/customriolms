import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class CertSize(str, enum.Enum):
    LANDSCAPE = "landscape"  # 11 x 8.5 in
    PORTRAIT = "portrait"    # 8.5 x 11 in
    SQUARE = "square"        # 1:1


class CertTemplate(Base):
    """
    A reusable certificate design — background image, accent color,
    which fields print, their font size and drag-positioned coordinates.
    fields / field_positions / field_font_sizes are JSONB rather than
    normalized columns because they're keyed by a field name (learnerName,
    courseTitle, qrCode, ...) that the frontend defines and may extend
    without a migration — e.g. adding a new field type is a frontend
    change only, not a schema change, as long as it's read generically.
    """
    __tablename__ = "cert_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    background_url: Mapped[str | None] = mapped_column(Text, nullable=True)  # image data URL
    accent_color: Mapped[str] = mapped_column(String(7), default="#3D5AFE")
    size: Mapped[CertSize] = mapped_column(default=CertSize.LANDSCAPE)

    show_header: Mapped[bool] = mapped_column(Boolean, default=True)
    header_text: Mapped[str] = mapped_column(String(100), default="CERTIFICATE OF COMPLETION")

    fields: Mapped[dict] = mapped_column(JSONB, default=dict)             # { "learnerName": true, "qrCode": true, ... }
    field_positions: Mapped[dict] = mapped_column(JSONB, default=dict)    # { "learnerName": {"x": 50, "y": 40}, ... }
    field_font_sizes: Mapped[dict] = mapped_column(JSONB, default=dict)   # { "learnerName": 15, ... }

    org: Mapped["Org"] = relationship()


class Certificate(Base):
    """
    An issued certificate — the record a verification page/QR code
    resolves. `code` is the human-shown verification code (e.g.
    "SC101-8841-NJ"), separate from `id`, because it needs to be
    short and presentable, not a raw UUID.

    Issuing this automatically on course completion needs Enrollment +
    module-progress tracking, neither of which exist yet — for now
    these are created by an explicit admin action (or, later, invoked
    by whatever completion pipeline gets built). This table is only
    "here's a certificate that exists," not "here's when to make one."
    """
    __tablename__ = "certificates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cert_templates.id"), nullable=True)

    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    # Column is TIMESTAMP WITHOUT TIME ZONE (initial schema), so store naive UTC — an aware
    # datetime makes asyncpg reject the insert.
    issued_at: Mapped[datetime] = mapped_column(default=lambda: datetime.now(timezone.utc).replace(tzinfo=None))

    org: Mapped["Org"] = relationship()
    user: Mapped["User"] = relationship()
    course: Mapped["Course"] = relationship()
    template: Mapped["CertTemplate | None"] = relationship()

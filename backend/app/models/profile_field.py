"""
Org-admin-defined custom profile fields — Moodle's user_info_field /
user_info_data pattern. An Org Admin defines a small set of extra
questions their org wants on every user's profile (e.g. "Employee ID",
"Shift", "Blood group") beyond the fixed core set (firstname, email,
city, ...), each with its own input type; every user then has one value
per field (or none, until they fill it in).

Two tables, same split Moodle uses and for the same reason: the field
*definitions* are few and org-scoped (UserInfoField), while the *values*
are one row per (field, user) pair and can be added/edited/removed
without ever touching the definition (UserInfoData) — exactly like
Module.restrictions vs. the modules it's attached to, just normalized
into its own table instead of JSONB, since admin + learner UI both need
to query "every field for this org" and "every value for this user"
independently and efficiently.
"""
import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import ARRAY, Boolean, DateTime, Enum, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class ProfileFieldType(str, enum.Enum):
    INPUT = "input"         # single-line text
    TEXTAREA = "textarea"   # multi-line text
    CHECKBOX = "checkbox"   # boolean, stored as "true"/"false" in value
    RADIO = "radio"         # exactly one of `options`
    SELECT = "select"       # exactly one of `options`, dropdown


class UserInfoField(Base):
    """One custom field an Org Admin has defined for their org. Deleting a
    field cascades to every user's stored value for it (UserInfoData.field)
    — there's nothing meaningful left to keep once the question itself is
    gone."""
    __tablename__ = "user_info_fields"
    __table_args__ = (UniqueConstraint("org_id", "shortname", name="uq_user_info_fields_org_shortname"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    # Machine-safe identifier (lowercase, no spaces) — unique per org,
    # used as the JSON key when posting values; `name` is the human label
    # actually shown on the profile form.
    shortname: Mapped[str] = mapped_column(String(100), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    field_type: Mapped[ProfileFieldType] = mapped_column(Enum(ProfileFieldType, name="profilefieldtype"), nullable=False)
    # Only meaningful for RADIO/SELECT — the fixed choice list. Empty for
    # every other type.
    options: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    sortorder: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    values: Mapped[list["UserInfoData"]] = relationship(back_populates="field", cascade="all, delete-orphan")


class UserInfoData(Base):
    """One user's value for one custom field. Absence of a row means
    "never filled in" (distinct from an explicit empty string), which is
    how a `required` field's "missing" state is detected without a
    separate flag."""
    __tablename__ = "user_info_data"
    __table_args__ = (UniqueConstraint("field_id", "user_id", name="uq_user_info_data_field_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    field_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user_info_fields.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    value: Mapped[str | None] = mapped_column(Text, nullable=True)

    field: Mapped["UserInfoField"] = relationship(back_populates="values")

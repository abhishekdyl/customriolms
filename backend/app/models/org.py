import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import ARRAY, DateTime, Enum, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OrgPlan(str, enum.Enum):
    STARTER = "starter"
    GROWTH = "growth"
    ENTERPRISE = "enterprise"


class OrgStatus(str, enum.Enum):
    ACTIVE = "active"
    TRIAL = "trial"
    SUSPENDED = "suspended"


PLAN_USER_LIMITS = {OrgPlan.STARTER: 20, OrgPlan.GROWTH: 100, OrgPlan.ENTERPRISE: 500}


class Org(Base):
    __tablename__ = "orgs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    plan: Mapped[OrgPlan] = mapped_column(Enum(OrgPlan, name="orgplan"), default=OrgPlan.STARTER, nullable=False)
    status: Mapped[OrgStatus] = mapped_column(Enum(OrgStatus, name="orgstatus"), default=OrgStatus.TRIAL, nullable=False)
    user_limit: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    # Empty = any email domain can join/be invited. Non-empty = invites,
    # bulk-CSV rows, and the public QR/link join flow all reject any email
    # whose domain isn't in this list. Enforced in invite_service, not here.
    allowed_domains: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Org profile — edited by the org's own Org Admin on the Org Settings
    # page, distinct from plan/status/user_limit above which only the
    # platform's Super Admin can touch (via orgs.py's super-admin-only
    # endpoints). All nullable/defaulted so existing orgs don't need
    # backfilling.
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Off by default: every user's username mirrors their email and login
    # only ever happens by email. Once an Org Admin flips this on, users
    # may set their own custom username from their profile (see
    # auth.update_me) and log in with it afterward — auth.login matches
    # against username OR email either way, so existing email-based
    # logins keep working regardless of this setting.
    allow_custom_username: Mapped[bool] = mapped_column(default=False, nullable=False)

    teams: Mapped[list["Team"]] = relationship(back_populates="org")
    users: Mapped[list["User"]] = relationship(back_populates="org")

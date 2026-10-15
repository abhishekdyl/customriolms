import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RoleName(str, enum.Enum):
    SUPER_ADMIN = "super_admin"   # RioSmartech staff, cross-org
    ORG_ADMIN = "org_admin"       # full control within their org
    TEAM_LEAD = "team_lead"       # scoped to their own team(s)
    LEARNER = "learner"           # self-scoped only


class UserStatus(str, enum.Enum):
    INVITED = "invited"   # invite sent, password not yet set
    ACTIVE = "active"
    SUSPENDED = "suspended"      # reversible — user stays visible with a badge
    DEACTIVATED = "deactivated"  # soft delete — never hard-delete a user with progress history


def split_full_name(full_name: str) -> tuple[str, str]:
    """Splits a single display-name string into (firstname, lastname) —
    used only at creation time (register/invite/bulk-CSV still collect one
    "name" field from the admin/learner) so the firstname/lastname columns
    always have something sensible in them. First whitespace-separated
    token is firstname, everything else is lastname (empty string if the
    name was a single word) — good enough for a one-time split; the user
    can separate them properly afterward via their own profile edit."""
    parts = (full_name or "").split(None, 1)
    if not parts:
        return "", ""
    if len(parts) == 1:
        return parts[0], ""
    return parts[0], parts[1]


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    team_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=True)

    firstname: Mapped[str] = mapped_column(String(100), nullable=False)
    lastname: Mapped[str] = mapped_column(String(100), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    # The actual login identifier (see auth.login) — defaults to a copy of
    # email at creation time and stays mirrored to it unless the org's
    # allow_custom_username setting lets the user pick their own (see
    # update_me/UpdateProfileRequest). Deliberately has NO relationship to
    # firstname/lastname. Unique, never null — every user logs in by
    # *something* in this column even before they've customized it.
    username: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)  # null until an invited user sets one
    role: Mapped[RoleName] = mapped_column(Enum(RoleName), default=RoleName.LEARNER, nullable=False)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False)
    invite_token: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    # True for every admin-created account (single invite or bulk CSV) —
    # they start on the shared default password, so the very first login
    # must swap it for something only they know before anything else works.
    must_change_password: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Self-service profile — editable by the user themselves (email is the
    # login identity, not editable here; username's editability is gated
    # by the org's allow_custom_username setting, enforced in auth.py).
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    bio: Mapped[str | None] = mapped_column(String(500), nullable=True)
    # Free-text, not a fixed country list — just what a module's
    # profile_field restriction (see Module.restrictions) can match
    # against, e.g. "only learners whose country is China".
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # IANA zone name (e.g. "Asia/Kolkata"); free text like country/city,
    # not validated against a fixed list.
    timezone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    companyname: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Object-storage key into the new `files` table ledger
    # (component="user", filearea="avatar", itemid=user.id) — not a raw
    # URL, same pattern as Module.file_key; the URL is rebuilt fresh on
    # every read (presigned on R2, or the local file route).
    avatar_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    org: Mapped["Org"] = relationship(back_populates="users")
    team: Mapped["Team | None"] = relationship(back_populates="users")

    @property
    def full_name(self) -> str:
        """Display name — every consumer that used to read `user.name`
        now reads this instead. firstname/lastname have no relationship
        to username by design (see split_full_name's docstring)."""
        return f"{self.firstname} {self.lastname}".strip()

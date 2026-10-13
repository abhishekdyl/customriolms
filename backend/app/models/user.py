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


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    team_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=True)

    name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str | None] = mapped_column(String(255), nullable=True)  # null until an invited user sets one
    role: Mapped[RoleName] = mapped_column(Enum(RoleName), default=RoleName.LEARNER, nullable=False)
    status: Mapped[UserStatus] = mapped_column(Enum(UserStatus), default=UserStatus.ACTIVE, nullable=False)
    invite_token: Mapped[str | None] = mapped_column(String(255), nullable=True, unique=True)
    # True for every admin-created account (single invite or bulk CSV) —
    # they start on the shared default password, so the very first login
    # must swap it for something only they know before anything else works.
    must_change_password: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Self-service profile — editable by the user themselves (email is the
    # username, so it is deliberately NOT editable).
    # phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # job_title: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # location: Mapped[str | None] = mapped_column(String(120), nullable=True)
    # bio: Mapped[str | None] = mapped_column(String(500), nullable=True)

    org: Mapped["Org"] = relationship(back_populates="users")
    team: Mapped["Team | None"] = relationship(back_populates="users")

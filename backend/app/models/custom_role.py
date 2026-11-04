import uuid
from datetime import datetime, timezone

from sqlalchemy import ARRAY, DateTime, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RoleScope:
    """Data-visibility scope a custom role carries — the same split the
    built-in Team Lead role already has (see User.role's docstring and
    every service's "A Team Lead sees only their own team" comments), now
    choosable per custom role instead of hardcoded to one role name.
    Plain string constants, not a DB enum — same reasoning as
    CustomRole.capabilities below: this is read/written as plain text
    everywhere, never needs its own index or FK."""
    ORG = "org"            # sees the whole org, same as Org Admin
    OWN_TEAM = "own_team"  # sees only their own assigned team, same as Team Lead


class CustomRole(Base):
    """An org-defined role beyond the four built-in ones (Super Admin, Org
    Admin, Team Lead, Learner) — Moodle's "Define roles" page, scoped down
    to org-level only (no per-course role assignment). An Org Admin picks
    a name, a data-visibility scope (RoleScope), and a set of capability
    keys (see app.services.permission_service.CAPABILITY_CATALOG) from a
    fixed catalog; a user is then assigned this role via
    User.custom_role_id (with User.role set to RoleName.CUSTOM).

    The built-in roles are deliberately NOT rows here and stay fixed in
    code (see permission_service.BUILTIN_CAPABILITIES) — only new custom
    roles are defined through this table, per the org's own choice to
    keep Org Admin/Team Lead/Learner's behavior unchanged and avoid the
    risk of an admin editing their own role out from under themselves."""
    __tablename__ = "custom_roles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[str] = mapped_column(String(300), nullable=False, default="")

    # RoleScope.ORG | RoleScope.OWN_TEAM — see RoleScope's docstring.
    scope: Mapped[str] = mapped_column(String(20), nullable=False, default=RoleScope.ORG)

    # Capability keys from permission_service.CAPABILITY_CATALOG, e.g.
    # ["courses.view", "users.invite"] — a soft-reference array, same
    # pattern as CourseGroup.member_user_ids and Course.badge_ids: no
    # join table, validated against the live catalog at write time
    # (custom_role_service.validate_capabilities) rather than enforced by
    # a DB constraint, since the catalog can grow without a migration.
    capabilities: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    users: Mapped[list["User"]] = relationship(back_populates="custom_role")  # noqa: F821

"""The capability catalog and the two resolvers every permission check in
the app is built on: has_capability (can this user do X) and
is_team_scoped (should this user's data be filtered to their own team).

Design, per the org's own scoping decision: curated capability GROUPS
(courses, users, teams, ...) each broken into several independently
toggleable capabilities — fine enough that e.g. "Users" can grant
users.view + users.invite without also handing out users.delete — but
not one capability per literal API endpoint (Moodle's ~400), which would
mean a 75-checkbox wall of near-duplicates for little real benefit.

The four built-in roles (Super Admin, Org Admin, Team Lead, Learner) stay
exactly as capable as they are today and are NOT editable — see
CustomRole's docstring for why. BUILTIN_CAPABILITIES below is simply
today's require_role(...) gates, re-expressed as capability sets, so
converting an endpoint from require_role to require_capability never
changes who could already call it.
"""
from app.models.custom_role import RoleScope
from app.models.user import RoleName, User

# ---------- The catalog ----------
# (capability key, human label) tuples, grouped under a label used as the
# section heading on the "Define roles" admin UI. Keys are
# "area.action" — stable strings stored in CustomRole.capabilities and in
# no other schema, so the catalog can grow freely across releases without
# a migration; validate_capabilities (below) is what keeps a role's stored
# keys from drifting out of sync with it.
CAPABILITY_CATALOG: dict[str, list[tuple[str, str]]] = {
    "Courses": [
        ("courses.view", "View courses, enrollment, and progress/gradebook reports"),
        ("courses.manage", "Create, edit, publish, delete, duplicate, export/import courses"),
        ("courses.manage_content", "Add/edit/delete modules, upload files & SCORM, manage groups"),
        ("courses.assign", "Assign courses to teams or individual learners"),
        ("courses.grade", "Override attempt limits and due dates"),
    ],
    "Categories": [
        ("categories.view", "View course categories"),
        ("categories.manage", "Create, rename, delete course categories"),
    ],
    "Users": [
        ("users.view", "View the user list and individual profiles"),
        ("users.invite", "Invite individual users"),
        ("users.bulk_invite", "Bulk-invite users via CSV"),
        ("users.manage_role", "Change a user's role"),
        ("users.manage_team", "Move a user between teams"),
        ("users.manage_status", "Suspend or reactivate a user"),
        ("users.manage_profile", "Edit another user's profile details"),
        ("users.login_as", "Log in as another user"),
        ("users.delete", "Remove a user"),
    ],
    "Teams": [
        ("teams.view", "View the team list"),
        ("teams.manage", "Create, rename, delete teams; view skill coverage"),
    ],
    "Reports": [
        ("reports.view", "View the Reports & Analytics page"),
    ],
    "Audit Log": [
        ("audit_log.view", "View the org-wide audit log"),
    ],
    "Certificates": [
        ("certificates.view", "View certificate templates and issued certificates"),
        ("certificates.manage", "Create/edit templates, issue and revoke certificates"),
    ],
    "Badges": [
        ("badges.view", "View badges"),
        ("badges.manage", "Create, edit, delete badges"),
    ],
    "Skills": [
        ("skills.view", "View skills"),
        ("skills.manage", "Create, rename, delete skills"),
    ],
    "Question Banks": [
        ("question_banks.manage", "Create and manage shared question banks"),
    ],
    "Notifications": [
        ("notifications.manage", "Manage email templates, reminder rules, and org SMTP"),
    ],
    "Org Profile Fields": [
        ("profile_fields.manage", "Define this org's custom profile fields"),
    ],
    "Org Settings": [
        ("org_settings.manage", "Edit org profile settings; deactivate the org"),
    ],
}

# Flat set of every valid key, for fast membership checks and for
# validate_capabilities.
ALL_CAPABILITIES: frozenset[str] = frozenset(key for group in CAPABILITY_CATALOG.values() for key, _ in group)

# What Team Lead can do today, reproduced exactly from every
# require_role(ORG_ADMIN, TEAM_LEAD) gate in the API as of this feature's
# introduction — a Team Lead's access is unchanged by this feature.
_TEAM_LEAD_CAPABILITIES: frozenset[str] = frozenset({
    "courses.view", "courses.assign",
    "categories.view",
    "users.view", "users.invite",
    "teams.view",
    "reports.view",
    "certificates.view",
    "badges.view",
    "skills.view",
})

# None here means "every capability" — Super Admin and Org Admin are not
# limited to ALL_CAPABILITIES, they simply bypass the check entirely (see
# has_capability), same as require_role's own SUPER_ADMIN bypass already
# worked. Learner has none — an admin capability check should never pass
# for a plain learner account.
BUILTIN_CAPABILITIES: dict[RoleName, frozenset[str] | None] = {
    RoleName.SUPER_ADMIN: None,
    RoleName.ORG_ADMIN: None,
    RoleName.TEAM_LEAD: _TEAM_LEAD_CAPABILITIES,
    RoleName.LEARNER: frozenset(),
}


def validate_capabilities(keys: list[str]) -> list[str]:
    """Drops anything not in ALL_CAPABILITIES (a stale key from a removed
    capability, or a typo from a hand-crafted request) rather than
    rejecting the whole save — same "be lenient reading, strict on new
    writes only where it matters" spirit as the rest of this codebase.
    Used by custom_role_service before every create/update."""
    bad = [k for k in keys if k not in ALL_CAPABILITIES]
    if bad:
        raise ValueError(f"Unknown capabilit{'y' if len(bad) == 1 else 'ies'}: {', '.join(sorted(set(bad)))}")
    return sorted(set(keys))


def user_capabilities(user: User) -> frozenset[str] | None:
    """None = every capability (Super Admin / Org Admin). Otherwise the
    exact set this user's role (built-in or custom) grants."""
    if user.role == RoleName.CUSTOM:
        if user.custom_role is None:
            return frozenset()  # orphaned (role deleted out from under them) — fail closed
        return frozenset(user.custom_role.capabilities)
    return BUILTIN_CAPABILITIES.get(user.role, frozenset())


def has_capability(user: User, capability: str) -> bool:
    caps = user_capabilities(user)
    return caps is None or capability in caps


def is_team_scoped(user: User) -> bool:
    """True when this user's data visibility should be limited to their
    own assigned team — Team Lead today, or any custom role defined with
    scope=RoleScope.OWN_TEAM. Every service that currently checks
    `current_user.role == RoleName.TEAM_LEAD` to decide "whole org or just
    my team" should check this instead, so a custom "own team" role gets
    the exact same filtering Team Lead already has."""
    if user.role == RoleName.TEAM_LEAD:
        return True
    if user.role == RoleName.CUSTOM and user.custom_role is not None:
        return user.custom_role.scope == RoleScope.OWN_TEAM
    return False

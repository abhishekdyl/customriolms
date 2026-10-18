import csv
import io
import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.org import Org
from app.models.team import Team
from app.models.user import RoleName, User, UserStatus, split_full_name
from app.schemas.user import BulkInviteResult
from app.services import profile_field_service

# Every admin-created account starts here — shown to the admin right
# after creating the user, and the user is forced to replace it (see
# User.must_change_password) before they can do anything else.
DEFAULT_PASSWORD = "Password@123"


class AlreadyRegistered(ValueError):
    pass


class DomainNotAllowed(ValueError):
    pass


class SeatLimitReached(ValueError):
    pass


async def _get_or_create_team(db: AsyncSession, org_id: uuid.UUID, team_name: str) -> Team:
    result = await db.execute(select(Team).where(Team.org_id == org_id, Team.name == team_name))
    team = result.scalar_one_or_none()
    if team is None:
        team = Team(org_id=org_id, name=team_name)
        db.add(team)
        await db.flush()
    return team


async def invite_user(
    db: AsyncSession,
    org: Org,
    email: str,
    name: str,
    role: RoleName,
    team_id: uuid.UUID | None,
) -> User:
    """
    Single source of truth for creating an admin-added user. Both the
    single-invite endpoint and the bulk CSV importer call this — never
    duplicate this logic in the router.

    Enforces the same two org-wide limits a self-service signup already
    respects (see auth.register) but that admin-added users previously
    skipped entirely: the org's allowed_domains allowlist (empty = no
    restriction) and its user_limit seat cap. Each raises its own
    ValueError subclass so a caller that invites many rows at once (the
    bulk CSV importer) can tell "this one email's domain is wrong" apart
    from "the whole org is full" and sort rows accordingly, while the
    single-invite endpoint's plain `except ValueError` still works
    unchanged since all three are ValueError.

    Accounts are created ACTIVE with the shared default password rather
    than the invite-link/set-your-own-password flow — must_change_password
    is what forces them to replace it on first login.
    """
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise AlreadyRegistered(f"{email} is already registered")

    if org.allowed_domains:
        domain = email.rsplit("@", 1)[-1].lower()
        if domain not in org.allowed_domains:
            raise DomainNotAllowed(
                f"{email} is outside this org's allowed domain(s): {', '.join(org.allowed_domains)}"
            )

    if org.user_limit:
        count = await db.execute(
            select(func.count(User.id)).where(User.org_id == org.id, User.status != UserStatus.DEACTIVATED)
        )
        if count.scalar_one() >= org.user_limit:
            raise SeatLimitReached(f"{org.name} has reached its {org.user_limit}-seat limit")

    firstname, lastname = split_full_name(name)
    user = User(
        org_id=org.id,
        team_id=team_id,
        firstname=firstname,
        lastname=lastname,
        email=email,
        username=email,  # default — see Org.allow_custom_username
        hashed_password=hash_password(DEFAULT_PASSWORD),
        role=role,
        status=UserStatus.ACTIVE,
        must_change_password=True,
    )
    db.add(user)
    await db.flush()

    return user


async def bulk_invite_from_csv(db: AsyncSession, org: Org, file_bytes: bytes) -> BulkInviteResult:
    """
    Expects columns: name, email, team_name, role (role optional, defaults
    to learner) — plus one column per org-defined custom profile field
    (see profile_field_service), keyed by its shortname, exactly as
    GET /api/v1/org-profile-fields and the downloadable template list
    them. A required custom field (UserInfoField.required) must have both
    its column present in the header and a value on every row — those are
    treated as malformed-file problems (same severity as a missing name/
    email/team_name) and abort the whole upload before any row is
    written, rather than silently creating users without the data an
    org admin specifically marked mandatory. An optional field's column
    is used when present and simply left blank when it isn't.

    Validates every row before writing any of them for those structural
    problems — an invalid row 5 should not leave rows 1-4 committed and
    row 6+ silently skipped. A per-row business-logic exclusion (already
    registered, outside the allowed email domain, no seats left) is
    different: that row is skipped and reported back, while every other
    valid row still gets invited, same as the already-registered check
    that existed before this.
    """
    fields = await profile_field_service.list_fields(db, org.id)
    required_fields = [f for f in fields if f.required]

    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))
    header = reader.fieldnames or []
    rows = list(reader)

    missing_cols = [f.shortname for f in required_fields if f.shortname not in header]
    if missing_cols:
        raise ValueError(
            f"CSV is missing required column(s): {', '.join(missing_cols)} — download the template again"
        )

    for i, row in enumerate(rows, start=2):  # row 1 is the header
        if not row.get("name") or not row.get("email") or not row.get("team_name"):
            raise ValueError(f"Row {i} is missing a required column (name, email, team_name)")
        for f in required_fields:
            if not (row.get(f.shortname) or "").strip():
                raise ValueError(f'Row {i} is missing a value for the required field "{f.name}" ({f.shortname})')

    invited_count = 0
    skipped: list[str] = []
    domain_rejected: list[str] = []
    seat_limited: list[str] = []

    for row in rows:
        email = row["email"].strip().lower()
        team = await _get_or_create_team(db, org.id, row["team_name"].strip())
        role = RoleName(row.get("role", "learner").strip().lower())

        try:
            user = await invite_user(db, org=org, email=email, name=row["name"].strip(), role=role, team_id=team.id)
        except AlreadyRegistered:
            skipped.append(email)
            continue
        except DomainNotAllowed:
            domain_rejected.append(email)
            continue
        except SeatLimitReached:
            seat_limited.append(email)
            # Every remaining row would hit the exact same cap — reporting
            # them all (rather than stopping at the first) is what lets
            # the admin see at a glance how many seats they're short by.
            continue

        # Every custom field this row actually filled in (required or
        # not) — set_values_for_user upserts by shortname and silently
        # ignores any column that isn't a real field, so a stray extra
        # CSV column never breaks the import. commit=False: this whole
        # bulk import is one transaction, committed once at the end.
        values = {f.shortname: row[f.shortname] for f in fields if row.get(f.shortname)}
        if values:
            await profile_field_service.set_values_for_user(db, org.id, user.id, values, commit=False)
        invited_count += 1

    await db.commit()
    return BulkInviteResult(invited=invited_count, skipped=skipped, domain_rejected=domain_rejected, seat_limited=seat_limited)

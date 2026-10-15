import csv
import io
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.team import Team
from app.models.user import RoleName, User, UserStatus, split_full_name
from app.schemas.user import BulkInviteResult

# Every admin-created account starts here — shown to the admin right
# after creating the user, and the user is forced to replace it (see
# User.must_change_password) before they can do anything else.
DEFAULT_PASSWORD = "Password@123"


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
    org_id: uuid.UUID,
    email: str,
    name: str,
    role: RoleName,
    team_id: uuid.UUID | None,
) -> User:
    """
    Single source of truth for creating an admin-added user. Both the
    single-invite endpoint and the bulk CSV importer call this — never
    duplicate this logic in the router.

    Accounts are created ACTIVE with the shared default password rather
    than the invite-link/set-your-own-password flow — must_change_password
    is what forces them to replace it on first login.
    """
    existing = await db.execute(select(User).where(User.email == email))
    if existing.scalar_one_or_none():
        raise ValueError(f"{email} is already registered")

    firstname, lastname = split_full_name(name)
    user = User(
        org_id=org_id,
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


async def bulk_invite_from_csv(db: AsyncSession, org_id: uuid.UUID, file_bytes: bytes) -> BulkInviteResult:
    """
    Expects columns: name, email, team_name, role (role optional, defaults to learner).
    Validates every row before writing any of them — an invalid row 5
    should not leave rows 1-4 committed and row 6+ silently skipped.
    """
    text = file_bytes.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    rows = list(reader)
    for i, row in enumerate(rows, start=2):  # row 1 is the header
        if not row.get("name") or not row.get("email") or not row.get("team_name"):
            raise ValueError(f"Row {i} is missing a required column (name, email, team_name)")

    invited_count = 0
    skipped: list[str] = []

    for row in rows:
        email = row["email"].strip().lower()
        existing = await db.execute(select(User).where(User.email == email))
        if existing.scalar_one_or_none():
            skipped.append(email)
            continue

        team = await _get_or_create_team(db, org_id, row["team_name"].strip())
        role = RoleName(row.get("role", "learner").strip().lower())

        await invite_user(db, org_id=org_id, email=email, name=row["name"].strip(), role=role, team_id=team.id)
        invited_count += 1

    await db.commit()
    return BulkInviteResult(invited=invited_count, skipped=skipped)

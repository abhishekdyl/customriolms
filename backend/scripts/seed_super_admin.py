"""
Creates the very first SUPER_ADMIN user directly in the database.

Why this exists: the public /api/v1/auth/register endpoint always creates
a new Org + ORG_ADMIN (that's how a customer signs their company up). A
SUPER_ADMIN is RioSmartech's own staff account and must never be
creatable from a public form, so it's seeded here instead, straight into
the database, before anyone touches the UI.

Usage (run from the backend/ folder, with the venv active):
    python scripts/seed_super_admin.py --email admin@riosmartech.com --password "SomeStrongPass123" --name "Platform Admin"

Safe to re-run: if a user with that email already exists, it just
upgrades their role to SUPER_ADMIN and resets the password instead of
creating a duplicate.
"""

import argparse
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import select

from app.core.database import AsyncSessionLocal
from app.core.security import hash_password
from app.models.org import Org
from app.models.user import RoleName, User, UserStatus
from app.models import org, team, user, category, course, module, skill, badge, certificate  # noqa: F401

PLATFORM_ORG_NAME = "RioSmartech (Platform)"
PLATFORM_ORG_SLUG = "riosmartech-platform"


async def seed(email: str, password: str, name: str) -> None:
    async with AsyncSessionLocal() as db:
        # Super admins aren't scoped to a customer org, but the users
        # table requires an org_id, so we park them in one dedicated
        # internal org that's never shown to customers.
        result = await db.execute(select(Org).where(Org.slug == PLATFORM_ORG_SLUG))
        org = result.scalar_one_or_none()
        if org is None:
            org = Org(name=PLATFORM_ORG_NAME, slug=PLATFORM_ORG_SLUG)
            db.add(org)
            await db.flush()
            print(f"Created internal org '{PLATFORM_ORG_NAME}'")

        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()

        if user is None:
            user = User(
                org_id=org.id,
                name=name,
                email=email,
                hashed_password=hash_password(password),
                role=RoleName.SUPER_ADMIN,
                status=UserStatus.ACTIVE,
            )
            db.add(user)
            print(f"Created new SUPER_ADMIN user: {email}")
        else:
            user.role = RoleName.SUPER_ADMIN
            user.hashed_password = hash_password(password)
            user.status = UserStatus.ACTIVE
            print(f"Existing user found — upgraded to SUPER_ADMIN and password reset: {email}")

        await db.commit()
        print("Done. You can now log in with these credentials at /login.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a SUPER_ADMIN user.")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--name", default="Super Admin")
    args = parser.parse_args()

    asyncio.run(seed(args.email, args.password, args.name))


if __name__ == "__main__":
    main()

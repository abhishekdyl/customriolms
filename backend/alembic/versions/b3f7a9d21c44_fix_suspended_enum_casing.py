"""fix SUSPENDED enum casing mismatch

Revision ID: b3f7a9d21c44
Revises: 9d2a6c4f8e17
Create Date: 2026-10-18 14:50:00.000000

A prior migration (d864104467e9) added the new UserStatus value as
lowercase 'suspended', matching the Python enum's *value*. But the
userstatus type's other three labels (INVITED/ACTIVE/DEACTIVATED) were
created uppercase, matching the Python enum's *member name* — which is
what SQLAlchemy's Enum() column type actually sends to Postgres by
default (no values_callable is set anywhere in this codebase; see
app/models/user.py). So every status PATCH that tries to set SUSPENDED
has been sending the string "SUSPENDED", which the database has never
had a matching label for, and always 500s — this is what suspend_user
and the Users page's Suspend button have actually been doing since that
migration shipped.

Postgres can't rename or drop an enum label, so this just adds the
correctly cased value alongside the unusable old one. Nothing can be
sitting on the lowercase 'suspended' value already — every attempt to
write it has always 500'd (that's the bug) — and Postgres won't let a
freshly added enum value be read in the same transaction it was added
in anyway, so there's no safe follow-up UPDATE to add here even if one
were needed.
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b3f7a9d21c44'
down_revision: Union[str, None] = '9d2a6c4f8e17'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE userstatus ADD VALUE IF NOT EXISTS 'SUSPENDED'")


def downgrade() -> None:
    # Postgres has no "remove enum value" — left as a no-op, same as the
    # migration that introduced the original (broken) value.
    pass

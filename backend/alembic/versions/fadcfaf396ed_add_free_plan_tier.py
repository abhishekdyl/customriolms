"""add FREE plan tier

Revision ID: fadcfaf396ed
Revises: 10a9e1ea7ce4
Create Date: 2026-11-16 17:40:00.000000

Adds "FREE" as a fourth orgplan label, alongside STARTER/GROWTH/ENTERPRISE
(which were created uppercase in 72f6cab0b642 — see that migration).
Lets a self-registered org's plan read "Free" instead of "Starter" while
it's on its trial, so the Organizations and Subscriptions pages can show
which orgs are on the free tier at a glance (see Org.plan's docstring).

Postgres enum labels can only be added, never removed in-place, so
downgrade() is a no-op with an explanatory comment rather than a DROP
TYPE/recreate dance — same as every other enum-growing migration in this
project. If this somehow needs reverting, do it by hand: reassign any
FREE rows to STARTER first.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'fadcfaf396ed'
down_revision: Union[str, None] = '10a9e1ea7ce4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE orgplan ADD VALUE IF NOT EXISTS 'FREE'")


def downgrade() -> None:
    # Postgres has no DROP VALUE for enums. Reassign any orgs.plan = 'FREE'
    # rows to STARTER by hand first if you actually need to roll this back.
    pass

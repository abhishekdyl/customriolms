"""add DATETIME to profilefieldtype enum

Revision ID: f4a8d1e6c2b9
Revises: e7a1c4f9b3d6
Create Date: 2026-11-04

Adding an enum label is its own statement in Postgres — can't be done
inside a transaction block together with anything that uses the new
value in the same migration, hence AUTOCOMMIT here (same pattern this
project already uses for other postgres ENUM additions).
"""
from alembic import op

revision = "f4a8d1e6c2b9"
down_revision = "e7a1c4f9b3d6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE profilefieldtype ADD VALUE IF NOT EXISTS 'DATETIME'")


def downgrade() -> None:
    # Postgres can't drop a single enum value without rebuilding the type
    # (and every column/row using it) — not worth the churn for a dev
    # downgrade path. Any DATETIME-typed field/value created after the
    # upgrade would need to be removed by hand before downgrading.
    pass

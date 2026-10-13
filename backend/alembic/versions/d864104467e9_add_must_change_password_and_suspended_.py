"""add must change password and suspended status

Revision ID: d864104467e9
Revises: 72f6cab0b642
Create Date: 2026-09-18 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd864104467e9'
down_revision: Union[str, None] = '72f6cab0b642'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres won't let autogenerate detect a new enum VALUE on an
    # existing type — this has to be added by hand.
    op.execute("ALTER TYPE userstatus ADD VALUE IF NOT EXISTS 'suspended'")

    op.add_column('users', sa.Column('must_change_password', sa.Boolean(), nullable=False, server_default='false'))


def downgrade() -> None:
    op.drop_column('users', 'must_change_password')
    # Postgres has no easy "remove enum value" — left as a no-op on downgrade.

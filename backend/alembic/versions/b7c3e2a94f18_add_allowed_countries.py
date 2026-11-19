"""add allowed_countries to platform_settings

Revision ID: b7c3e2a94f18
Revises: fadcfaf396ed
Create Date: 2026-11-19 10:00:00.000000

Lets Super Admin curate which countries show up in the public
user-registration form's Country dropdown, instead of every form
offering the full world list. NULL (the default) means "no restriction
configured yet" — see PlatformSettings.allowed_countries' docstring and
app.core.countries.ALL_COUNTRIES for the fallback.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision: str = 'b7c3e2a94f18'
down_revision: Union[str, None] = 'fadcfaf396ed'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("platform_settings", sa.Column("allowed_countries", sa.ARRAY(sa.String()), nullable=True))


def downgrade() -> None:
    op.drop_column("platform_settings", "allowed_countries")

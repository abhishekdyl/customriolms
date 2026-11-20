"""Org address fields (city/country/pincode) + real logo upload + platform city/pincode/support email

Revision ID: e5f6a7b8c9d1
Revises: d4e5f6a7b8c9
Create Date: 2026-11-20 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e5f6a7b8c9d1"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orgs", sa.Column("city", sa.String(length=100), nullable=True))
    op.add_column("orgs", sa.Column("pincode", sa.String(length=20), nullable=True))
    op.add_column("orgs", sa.Column("country", sa.String(length=100), nullable=True))
    op.add_column("orgs", sa.Column("logo_key", sa.String(length=300), nullable=True))

    op.add_column("platform_settings", sa.Column("company_city", sa.String(length=100), nullable=True))
    op.add_column("platform_settings", sa.Column("company_pincode", sa.String(length=20), nullable=True))
    op.add_column("platform_settings", sa.Column("support_email", sa.String(length=255), nullable=True))


def downgrade() -> None:
    op.drop_column("platform_settings", "support_email")
    op.drop_column("platform_settings", "company_pincode")
    op.drop_column("platform_settings", "company_city")

    op.drop_column("orgs", "logo_key")
    op.drop_column("orgs", "country")
    op.drop_column("orgs", "pincode")
    op.drop_column("orgs", "city")

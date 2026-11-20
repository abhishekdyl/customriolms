"""GST invoice details — platform's own seller details + an org's billing/GSTIN

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-11-20 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b2c3d4e5f6a7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("platform_settings", sa.Column("company_legal_name", sa.String(length=200), nullable=True))
    op.add_column("platform_settings", sa.Column("company_address", sa.String(length=500), nullable=True))
    op.add_column("platform_settings", sa.Column("company_gstin", sa.String(length=20), nullable=True))
    op.add_column("platform_settings", sa.Column("company_state", sa.String(length=100), nullable=True))
    op.add_column("platform_settings", sa.Column("gst_rate_percent", sa.Integer(), nullable=False, server_default="18"))
    op.add_column("platform_settings", sa.Column("hsn_sac_code", sa.String(length=20), nullable=False, server_default="998316"))

    op.add_column("orgs", sa.Column("gstin", sa.String(length=20), nullable=True))
    op.add_column("orgs", sa.Column("billing_address", sa.String(length=500), nullable=True))
    op.add_column("orgs", sa.Column("billing_state", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("orgs", "billing_state")
    op.drop_column("orgs", "billing_address")
    op.drop_column("orgs", "gstin")

    op.drop_column("platform_settings", "hsn_sac_code")
    op.drop_column("platform_settings", "gst_rate_percent")
    op.drop_column("platform_settings", "company_state")
    op.drop_column("platform_settings", "company_gstin")
    op.drop_column("platform_settings", "company_address")
    op.drop_column("platform_settings", "company_legal_name")

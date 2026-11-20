"""Additive GST + gateway fee, toggled by Super Admin, locked into each payment

Replaces the earlier "reverse-split a tax-inclusive amount" idea: GST and
a gateway-fee surcharge are now ADDED ON TOP of a plan's price at
checkout time, each independently toggle-able, and each payment stores
its own base/gst/fee breakdown so a later rate change or toggle flip
never rewrites an already-issued invoice.

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-11-20 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e5f6a7b8c9"
down_revision: Union[str, None] = "c3d4e5f6a7b8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("platform_settings", sa.Column("gst_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("platform_settings", sa.Column("gateway_fee_enabled", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("platform_settings", sa.Column("gateway_fee_percent", sa.Float(), nullable=False, server_default="0"))

    op.add_column("org_payments", sa.Column("base_amount", sa.Integer(), nullable=True))
    op.add_column("org_payments", sa.Column("gst_amount", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("org_payments", sa.Column("gateway_fee_amount", sa.Integer(), nullable=False, server_default="0"))
    # Backfill: every payment that already exists was made before GST/fee
    # existed at all, so its whole `amount` was always just the base
    # plan price — gst_amount/gateway_fee_amount correctly default to 0
    # for them already.
    op.execute("UPDATE org_payments SET base_amount = amount WHERE base_amount IS NULL")
    op.alter_column("org_payments", "base_amount", nullable=False)


def downgrade() -> None:
    op.drop_column("org_payments", "gateway_fee_amount")
    op.drop_column("org_payments", "gst_amount")
    op.drop_column("org_payments", "base_amount")

    op.drop_column("platform_settings", "gateway_fee_percent")
    op.drop_column("platform_settings", "gateway_fee_enabled")
    op.drop_column("platform_settings", "gst_enabled")

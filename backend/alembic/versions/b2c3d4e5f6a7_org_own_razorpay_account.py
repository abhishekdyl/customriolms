"""Org's own Razorpay account — for paid course enrolment payouts

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-11-20 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: Union[str, None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orgs", sa.Column("razorpay_key_id", sa.String(length=100), nullable=True))
    op.add_column("orgs", sa.Column("razorpay_key_secret", sa.String(length=200), nullable=True))
    op.add_column("orgs", sa.Column("razorpay_webhook_secret", sa.String(length=200), nullable=True))


def downgrade() -> None:
    op.drop_column("orgs", "razorpay_webhook_secret")
    op.drop_column("orgs", "razorpay_key_secret")
    op.drop_column("orgs", "razorpay_key_id")

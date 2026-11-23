"""Move Live Classes BBB/Zoom credentials from platform_settings to orgs

The first cut made these platform-wide (Moodle-site-plugin style), but
the actual requirement is each org brings its own BigBlueButton server
and Zoom account — same as an org's own Razorpay account already works
(Org.razorpay_*), not like the platform's shared Razorpay/SMTP.

Revision ID: d4e9f1a2b3c7
Revises: c7d8e9f0a1b2
Create Date: 2026-11-23 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "d4e9f1a2b3c7"
down_revision: Union[str, None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orgs", sa.Column("bbb_server_url", sa.String(length=300), nullable=True))
    op.add_column("orgs", sa.Column("bbb_shared_secret", sa.String(length=300), nullable=True))
    op.add_column("orgs", sa.Column("zoom_account_id", sa.String(length=300), nullable=True))
    op.add_column("orgs", sa.Column("zoom_client_id", sa.String(length=300), nullable=True))
    op.add_column("orgs", sa.Column("zoom_client_secret", sa.String(length=300), nullable=True))

    op.drop_column("platform_settings", "zoom_client_secret")
    op.drop_column("platform_settings", "zoom_client_id")
    op.drop_column("platform_settings", "zoom_account_id")
    op.drop_column("platform_settings", "bbb_shared_secret")
    op.drop_column("platform_settings", "bbb_server_url")


def downgrade() -> None:
    op.add_column("platform_settings", sa.Column("bbb_server_url", sa.String(length=300), nullable=True))
    op.add_column("platform_settings", sa.Column("bbb_shared_secret", sa.String(length=300), nullable=True))
    op.add_column("platform_settings", sa.Column("zoom_account_id", sa.String(length=300), nullable=True))
    op.add_column("platform_settings", sa.Column("zoom_client_id", sa.String(length=300), nullable=True))
    op.add_column("platform_settings", sa.Column("zoom_client_secret", sa.String(length=300), nullable=True))

    op.drop_column("orgs", "zoom_client_secret")
    op.drop_column("orgs", "zoom_client_id")
    op.drop_column("orgs", "zoom_account_id")
    op.drop_column("orgs", "bbb_shared_secret")
    op.drop_column("orgs", "bbb_server_url")

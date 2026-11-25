"""org_request_stats — per-org daily API load counters

Revision ID: a5b6c7d8e9f0
Revises: f4a5b6c7d8e9
Create Date: 2026-11-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a5b6c7d8e9f0"
down_revision = "f4a5b6c7d8e9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "org_request_stats",
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), primary_key=True),
        sa.Column("stat_date", sa.Date(), primary_key=True),
        sa.Column("request_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_duration_ms", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("error_count", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_org_request_stats_stat_date", "org_request_stats", ["stat_date"])


def downgrade() -> None:
    op.drop_index("ix_org_request_stats_stat_date", table_name="org_request_stats")
    op.drop_table("org_request_stats")

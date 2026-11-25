"""app_activity_days — role-agnostic daily active-user tracking

Revision ID: d8e9f0a1b2c3
Revises: b6c7d8e9f0a1
Create Date: 2026-11-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d8e9f0a1b2c3"
down_revision = "b6c7d8e9f0a1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "app_activity_days",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), primary_key=True),
        sa.Column("day", sa.Date(), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
    )
    op.create_index("ix_app_activity_days_org_id", "app_activity_days", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_app_activity_days_org_id", table_name="app_activity_days")
    op.drop_table("app_activity_days")

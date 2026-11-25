"""Org.storage_limit_mb — per-plan storage quota, usage monitoring

Revision ID: f4a5b6c7d8e9
Revises: e3f4a5b6c7d8
Create Date: 2026-11-25
"""
from alembic import op
import sqlalchemy as sa

revision = "f4a5b6c7d8e9"
down_revision = "e3f4a5b6c7d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("orgs", sa.Column("storage_limit_mb", sa.Integer(), nullable=False, server_default="5120"))


def downgrade() -> None:
    op.drop_column("orgs", "storage_limit_mb")

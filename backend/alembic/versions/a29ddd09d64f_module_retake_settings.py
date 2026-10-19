"""Add retake_enabled / retake_limit to modules

Revision ID: a29ddd09d64f
Revises: b3f7a9d21c44
Create Date: 2026-10-19

"""
from alembic import op
import sqlalchemy as sa

revision = "a29ddd09d64f"
down_revision = "b3f7a9d21c44"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default='true' here is only to backfill EXISTING rows so a
    # quiz that already relied on "always allowed to retry a failed
    # attempt" keeps working unchanged. It's dropped right after — new
    # rows going forward get their value from Module's Python-side
    # default (False) instead, since every module is created through the
    # ORM, never raw SQL.
    op.add_column("modules", sa.Column("retake_enabled", sa.Boolean(), nullable=False, server_default=sa.text("true")))
    op.alter_column("modules", "retake_enabled", server_default=None)
    op.add_column("modules", sa.Column("retake_limit", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("modules", "retake_limit")
    op.drop_column("modules", "retake_enabled")

"""Add Course.completion_mode and Course.cover_image_key

Revision ID: a7b3f2e9c1d4
Revises: d4e8f6a1b9c2
Create Date: 2026-10-19

"""
from alembic import op
import sqlalchemy as sa

revision = "a7b3f2e9c1d4"
down_revision = "d4e8f6a1b9c2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("completion_mode", sa.String(length=10), nullable=False, server_default="all"))
    op.alter_column("courses", "completion_mode", server_default=None)
    op.add_column("courses", sa.Column("cover_image_key", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("courses", "cover_image_key")
    op.drop_column("courses", "completion_mode")

"""add maintenance_mode and debug_mode to platform_settings

Revision ID: a3c7e9f21d4b
Revises: f4a8d1e6c2b9
Create Date: 2026-11-04 17:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "a3c7e9f21d4b"
down_revision = "f4a8d1e6c2b9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "platform_settings",
        sa.Column("maintenance_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "platform_settings",
        sa.Column("debug_mode", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("platform_settings", "debug_mode")
    op.drop_column("platform_settings", "maintenance_mode")

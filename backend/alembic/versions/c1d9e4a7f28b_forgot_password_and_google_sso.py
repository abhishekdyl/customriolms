"""Add password-reset-token columns and Google SSO link on users

Revision ID: c1d9e4a7f28b
Revises: b4f1a8e6c3d7
Create Date: 2026-10-28

"""
from alembic import op
import sqlalchemy as sa

revision = "c1d9e4a7f28b"
down_revision = "b4f1a8e6c3d7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("reset_token_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_users_reset_token_hash", "users", ["reset_token_hash"])

    op.add_column("users", sa.Column("reset_token_expires_at", sa.DateTime(timezone=True), nullable=True))

    op.add_column("users", sa.Column("google_sub", sa.String(length=255), nullable=True))
    op.create_unique_constraint("uq_users_google_sub", "users", ["google_sub"])
    op.create_index("ix_users_google_sub", "users", ["google_sub"])


def downgrade() -> None:
    op.drop_index("ix_users_google_sub", table_name="users")
    op.drop_constraint("uq_users_google_sub", "users", type_="unique")
    op.drop_column("users", "google_sub")

    op.drop_column("users", "reset_token_expires_at")

    op.drop_index("ix_users_reset_token_hash", table_name="users")
    op.drop_column("users", "reset_token_hash")

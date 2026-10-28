"""Add platform SMTP settings and org-SMTP-fallback request/approval state

Revision ID: d2e5b9a1f4c6
Revises: c1d9e4a7f28b
Create Date: 2026-10-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d2e5b9a1f4c6"
down_revision = "c1d9e4a7f28b"
branch_labels = None
depends_on = None

SINGLETON_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    op.add_column(
        "org_smtp_settings",
        sa.Column("fallback_status", sa.String(length=10), nullable=False, server_default="none"),
    )
    op.add_column(
        "org_smtp_settings",
        sa.Column("fallback_requested_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "org_smtp_settings",
        sa.Column("fallback_decided_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "platform_smtp_settings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("host", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("port", sa.Integer(), nullable=False, server_default="587"),
        sa.Column("encryption", sa.String(length=10), nullable=False, server_default="TLS"),
        sa.Column("username", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("password", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("from_name", sa.String(length=200), nullable=False, server_default=""),
        sa.Column("from_email", sa.String(length=255), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_table("platform_smtp_settings")
    op.drop_column("org_smtp_settings", "fallback_decided_at")
    op.drop_column("org_smtp_settings", "fallback_requested_at")
    op.drop_column("org_smtp_settings", "fallback_status")

"""Add email_logs — audit trail of every outbound-mail attempt

Revision ID: e3f7c0a2b5d8
Revises: d2e5b9a1f4c6
Create Date: 2026-10-28

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e3f7c0a2b5d8"
down_revision = "d2e5b9a1f4c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "email_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("to_addr", sa.String(length=255), nullable=False),
        sa.Column("subject", sa.String(length=300), nullable=False),
        sa.Column("source", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("detail", sa.String(length=300), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_email_logs_org_id", "email_logs", ["org_id"])
    op.create_index("ix_email_logs_created_at", "email_logs", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_email_logs_created_at", table_name="email_logs")
    op.drop_index("ix_email_logs_org_id", table_name="email_logs")
    op.drop_table("email_logs")

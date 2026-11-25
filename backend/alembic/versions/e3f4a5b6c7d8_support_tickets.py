"""Support tickets — Org Admin <-> Super Admin helpdesk

Revision ID: e3f4a5b6c7d8
Revises: d2e3f4a5b6c7
Create Date: 2026-11-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e3f4a5b6c7d8"
down_revision = "d2e3f4a5b6c7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("raised_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("category", sa.String(20), nullable=False, server_default="query"),
        sa.Column("priority", sa.String(10), nullable=False, server_default="medium"),
        sa.Column("status", sa.String(10), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_support_tickets_org_id", "support_tickets", ["org_id"])
    op.create_index("ix_support_tickets_status", "support_tickets", ["status"])

    op.create_table(
        "support_ticket_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("ticket_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("support_tickets.id"), nullable=False),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_support_ticket_messages_ticket_id", "support_ticket_messages", ["ticket_id"])


def downgrade() -> None:
    op.drop_index("ix_support_ticket_messages_ticket_id", table_name="support_ticket_messages")
    op.drop_table("support_ticket_messages")
    op.drop_index("ix_support_tickets_status", table_name="support_tickets")
    op.drop_index("ix_support_tickets_org_id", table_name="support_tickets")
    op.drop_table("support_tickets")

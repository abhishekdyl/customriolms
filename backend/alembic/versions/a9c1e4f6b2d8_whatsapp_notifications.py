"""WhatsApp notifications — org settings, per-kind templates, send log, LiveClass.team_id

Revision ID: a9c1e4f6b2d8
Revises: f7a8b9c0d1e3
Create Date: 2026-11-24 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "a9c1e4f6b2d8"
down_revision: Union[str, None] = "f7a8b9c0d1e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "org_whatsapp_settings",
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), primary_key=True),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("api_key", sa.String(255), nullable=False, server_default=""),
        sa.Column("from_number", sa.String(20), nullable=False, server_default=""),
    )

    op.create_table(
        "whatsapp_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("template_name", sa.String(120), nullable=False, server_default=""),
        sa.Column("lang_code", sa.String(10), nullable=False, server_default="en_US"),
    )
    op.create_index("ix_whatsapp_templates_org_id", "whatsapp_templates", ["org_id"])

    op.create_table(
        "whatsapp_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("to_phone", sa.String(20), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("detail", sa.String(300), nullable=False, server_default=""),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_whatsapp_logs_org_id", "whatsapp_logs", ["org_id"])
    op.create_index("ix_whatsapp_logs_created_at", "whatsapp_logs", ["created_at"])

    op.add_column(
        "live_classes",
        sa.Column("team_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("teams.id"), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("live_classes", "team_id")
    op.drop_index("ix_whatsapp_logs_created_at", table_name="whatsapp_logs")
    op.drop_index("ix_whatsapp_logs_org_id", table_name="whatsapp_logs")
    op.drop_table("whatsapp_logs")
    op.drop_index("ix_whatsapp_templates_org_id", table_name="whatsapp_templates")
    op.drop_table("whatsapp_templates")
    op.drop_table("org_whatsapp_settings")

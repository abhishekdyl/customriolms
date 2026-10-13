"""notification templates, reminder rules, org smtp settings

Revision ID: f1a9d4c27b63
Revises: e3b7c19a5d28
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f1a9d4c27b63"
down_revision: Union[str, None] = "e3b7c19a5d28"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "notification_templates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("subject", sa.String(300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("editable", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_notification_templates_org_id", "notification_templates", ["org_id"])
    op.create_table(
        "reminder_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("trigger", sa.String(30), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("channels", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_reminder_rules_org_id", "reminder_rules", ["org_id"])
    op.create_table(
        "org_smtp_settings",
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), primary_key=True),
        sa.Column("use_custom", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("host", sa.String(255), nullable=False, server_default=""),
        sa.Column("port", sa.Integer(), nullable=False, server_default="587"),
        sa.Column("encryption", sa.String(10), nullable=False, server_default="TLS"),
        sa.Column("username", sa.String(255), nullable=False, server_default=""),
        sa.Column("password", sa.String(255), nullable=False, server_default=""),
        sa.Column("from_name", sa.String(200), nullable=False, server_default=""),
        sa.Column("from_email", sa.String(255), nullable=False, server_default=""),
    )


def downgrade() -> None:
    op.drop_table("org_smtp_settings")
    op.drop_index("ix_reminder_rules_org_id", table_name="reminder_rules")
    op.drop_table("reminder_rules")
    op.drop_index("ix_notification_templates_org_id", table_name="notification_templates")
    op.drop_table("notification_templates")

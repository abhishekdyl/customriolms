"""Live classes (BigBlueButton/Zoom) + platform-wide provider credentials

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d1e2
Create Date: 2026-11-23 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, None] = "f6a7b8c9d1e2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("platform_settings", sa.Column("bbb_server_url", sa.String(length=300), nullable=True))
    op.add_column("platform_settings", sa.Column("bbb_shared_secret", sa.String(length=300), nullable=True))
    op.add_column("platform_settings", sa.Column("zoom_account_id", sa.String(length=300), nullable=True))
    op.add_column("platform_settings", sa.Column("zoom_client_id", sa.String(length=300), nullable=True))
    op.add_column("platform_settings", sa.Column("zoom_client_secret", sa.String(length=300), nullable=True))

    op.create_table(
        "live_classes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("provider", sa.String(length=20), nullable=False),
        sa.Column("scheduled_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("duration_minutes", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("target_scope", sa.String(length=12), nullable=False, server_default="all"),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("user_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False, server_default="{}"),
        sa.Column("bbb_meeting_id", sa.String(length=100), nullable=True),
        sa.Column("bbb_moderator_pw", sa.String(length=64), nullable=True),
        sa.Column("bbb_attendee_pw", sa.String(length=64), nullable=True),
        sa.Column("bbb_created", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("zoom_meeting_id", sa.String(length=50), nullable=True),
        sa.Column("zoom_join_url", sa.String(length=500), nullable=True),
        sa.Column("zoom_start_url", sa.String(length=500), nullable=True),
        sa.Column("recording_url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_live_classes_org_id", "live_classes", ["org_id"])
    op.create_index("ix_live_classes_scheduled_start", "live_classes", ["scheduled_start"])


def downgrade() -> None:
    op.drop_index("ix_live_classes_scheduled_start", table_name="live_classes")
    op.drop_index("ix_live_classes_org_id", table_name="live_classes")
    op.drop_table("live_classes")
    op.drop_column("platform_settings", "zoom_client_secret")
    op.drop_column("platform_settings", "zoom_client_id")
    op.drop_column("platform_settings", "zoom_account_id")
    op.drop_column("platform_settings", "bbb_shared_secret")
    op.drop_column("platform_settings", "bbb_server_url")

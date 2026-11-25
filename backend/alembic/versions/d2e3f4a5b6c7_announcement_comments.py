"""Announcement discussion threads — comments + per-announcement toggle

Revision ID: d2e3f4a5b6c7
Revises: b1d2e3f4a5c6
Create Date: 2026-11-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d2e3f4a5b6c7"
down_revision = "b1d2e3f4a5c6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "course_announcements",
        sa.Column("comments_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "course_announcement_comments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("announcement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("course_announcements.id"), nullable=False),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_course_announcement_comments_org_id", "course_announcement_comments", ["org_id"])
    op.create_index("ix_course_announcement_comments_announcement_id", "course_announcement_comments", ["announcement_id"])


def downgrade() -> None:
    op.drop_index("ix_course_announcement_comments_announcement_id", table_name="course_announcement_comments")
    op.drop_index("ix_course_announcement_comments_org_id", table_name="course_announcement_comments")
    op.drop_table("course_announcement_comments")
    op.drop_column("course_announcements", "comments_enabled")

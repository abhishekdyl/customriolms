"""Course announcements — per-course announcement board, default-seeded

Revision ID: b1d2e3f4a5c6
Revises: a9c1e4f6b2d8
Create Date: 2026-11-25
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b1d2e3f4a5c6"
down_revision = "a9c1e4f6b2d8"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_announcements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("author_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("title", sa.String(300), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("is_hidden", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_course_announcements_org_id", "course_announcements", ["org_id"])
    op.create_index("ix_course_announcements_course_id", "course_announcements", ["course_id"])


def downgrade() -> None:
    op.drop_index("ix_course_announcements_course_id", table_name="course_announcements")
    op.drop_index("ix_course_announcements_org_id", table_name="course_announcements")
    op.drop_table("course_announcements")

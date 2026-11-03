"""Add course_groups — Groups/cohorts inside a course

Revision ID: a7c3e9f1b2d4
Revises: c91a4f03e7bd
Create Date: 2026-11-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a7c3e9f1b2d4"
down_revision = "c91a4f03e7bd"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column(
            "member_user_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=False, server_default="{}",
        ),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_course_groups_org_id", "course_groups", ["org_id"])
    op.create_index("ix_course_groups_course_id", "course_groups", ["course_id"])


def downgrade() -> None:
    op.drop_index("ix_course_groups_course_id", table_name="course_groups")
    op.drop_index("ix_course_groups_org_id", table_name="course_groups")
    op.drop_table("course_groups")

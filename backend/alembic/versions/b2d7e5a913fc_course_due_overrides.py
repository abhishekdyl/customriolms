"""Add course_due_overrides table — Calendar/due-date view, per-learner override

Revision ID: b2d7e5a913fc
Revises: f4b8d2a67c91
Create Date: 2026-11-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b2d7e5a913fc"
down_revision = "f4b8d2a67c91"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "course_due_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("course_id", "user_id", name="uq_due_override_course_user"),
    )
    op.create_index("ix_course_due_overrides_org_id", "course_due_overrides", ["org_id"])
    op.create_index("ix_course_due_overrides_course_id", "course_due_overrides", ["course_id"])
    op.create_index("ix_course_due_overrides_user_id", "course_due_overrides", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_course_due_overrides_user_id", table_name="course_due_overrides")
    op.drop_index("ix_course_due_overrides_course_id", table_name="course_due_overrides")
    op.drop_index("ix_course_due_overrides_org_id", table_name="course_due_overrides")
    op.drop_table("course_due_overrides")

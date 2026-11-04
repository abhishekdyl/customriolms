"""audit log course_id

Revision ID: d3e9f6a2c8b1
Revises: a7c3e9f1b2d4
Create Date: 2026-11-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d3e9f6a2c8b1"
down_revision = "a7c3e9f1b2d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("audit_logs", sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_audit_logs_course_id", "audit_logs", ["course_id"])


def downgrade() -> None:
    op.drop_index("ix_audit_logs_course_id", table_name="audit_logs")
    op.drop_column("audit_logs", "course_id")

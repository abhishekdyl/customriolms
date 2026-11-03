"""Add courses.prerequisite_course_ids — Prerequisites / learning paths

Revision ID: c91a4f03e7bd
Revises: b2d7e5a913fc
Create Date: 2026-11-03

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c91a4f03e7bd"
down_revision = "b2d7e5a913fc"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column(
            "prerequisite_course_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            nullable=False, server_default="{}",
        ),
    )


def downgrade() -> None:
    op.drop_column("courses", "prerequisite_course_ids")

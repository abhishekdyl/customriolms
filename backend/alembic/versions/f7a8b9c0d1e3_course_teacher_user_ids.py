"""Course.teacher_user_ids — multiple course teachers, replaces created_by for permissions

Revision ID: f7a8b9c0d1e3
Revises: e5f6a7b8c9d2
Create Date: 2026-11-24 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f7a8b9c0d1e3"
down_revision: Union[str, None] = "e5f6a7b8c9d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("teacher_user_ids", postgresql.ARRAY(postgresql.UUID(as_uuid=True)), nullable=False, server_default="{}"),
    )
    # Backfill: any course that already had a single Course Teacher
    # (created_by, set either at creation or via the old Settings-tab
    # dropdown) keeps that same person as its teacher under the new
    # multi-teacher array — nobody loses their existing teacher
    # assignment/ratings-moderation access across this migration.
    op.execute("UPDATE courses SET teacher_user_ids = ARRAY[created_by] WHERE created_by IS NOT NULL")


def downgrade() -> None:
    op.drop_column("courses", "teacher_user_ids")

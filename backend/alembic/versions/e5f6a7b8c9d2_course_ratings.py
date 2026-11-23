"""Course ratings & reviews + Course.created_by

Revision ID: e5f6a7b8c9d2
Revises: d4e9f1a2b3c7
Create Date: 2026-11-23 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d2"
down_revision: Union[str, None] = "d4e9f1a2b3c7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True))

    op.create_table(
        "course_ratings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("review_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("course_id", "user_id", name="uq_course_ratings_course_user"),
        sa.CheckConstraint("rating >= 1 AND rating <= 5", name="ck_course_ratings_rating_range"),
    )
    op.create_index("ix_course_ratings_org_id", "course_ratings", ["org_id"])
    op.create_index("ix_course_ratings_course_id", "course_ratings", ["course_id"])
    op.create_index("ix_course_ratings_user_id", "course_ratings", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_course_ratings_user_id", table_name="course_ratings")
    op.drop_index("ix_course_ratings_course_id", table_name="course_ratings")
    op.drop_index("ix_course_ratings_org_id", table_name="course_ratings")
    op.drop_table("course_ratings")
    op.drop_column("courses", "created_by")

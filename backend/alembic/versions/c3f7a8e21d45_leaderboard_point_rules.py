"""Org-configurable leaderboard point rules

Revision ID: c3f7a8e21d45
Revises: b7c3e2a94f18
Create Date: 2026-11-20 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "c3f7a8e21d45"
down_revision: Union[str, None] = "b7c3e2a94f18"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orgs", sa.Column("default_module_points", sa.Integer(), nullable=False, server_default="10"))
    op.add_column("orgs", sa.Column("default_course_points", sa.Integer(), nullable=False, server_default="50"))
    op.add_column("orgs", sa.Column("default_perfect_quiz_points", sa.Integer(), nullable=False, server_default="20"))

    op.create_table(
        "point_rules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("event", sa.Enum("MODULE_COMPLETE", "COURSE_COMPLETE", name="pointevent"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=True, unique=True),
        sa.Column("module_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("modules.id"), nullable=True, unique=True),
        sa.Column("points", sa.Integer(), nullable=False),
    )
    op.create_index("ix_point_rules_org_id", "point_rules", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_point_rules_org_id", table_name="point_rules")
    op.drop_table("point_rules")
    sa.Enum(name="pointevent").drop(op.get_bind())
    op.drop_column("orgs", "default_perfect_quiz_points")
    op.drop_column("orgs", "default_course_points")
    op.drop_column("orgs", "default_module_points")

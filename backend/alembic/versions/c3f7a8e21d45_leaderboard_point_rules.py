"""Org-configurable leaderboard point rules + levels/tiers

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
        sa.Column("scope", sa.Enum("COURSE", "MODULE", name="rulescope"), nullable=False),
        sa.Column("event", sa.Enum("START", "COMPLETE", name="ruleevent"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=True),
        sa.Column("module_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("modules.id"), nullable=True),
        sa.Column("points", sa.Integer(), nullable=False),
    )
    op.create_index("ix_point_rules_org_id", "point_rules", ["org_id"])
    op.create_index(
        "ux_point_rules_course_event", "point_rules", ["course_id", "event"],
        unique=True, postgresql_where=sa.text("course_id IS NOT NULL"),
    )
    op.create_index(
        "ux_point_rules_module_event", "point_rules", ["module_id", "event"],
        unique=True, postgresql_where=sa.text("module_id IS NOT NULL"),
    )

    op.create_table(
        "point_levels",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("min_points", sa.Integer(), nullable=False),
        sa.Column("max_points", sa.Integer(), nullable=True),
        sa.Column("color", sa.String(length=9), nullable=False, server_default="#778899"),
        sa.Column("image_key", sa.String(length=500), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_index("ix_point_levels_org_id", "point_levels", ["org_id"])


def downgrade() -> None:
    op.drop_index("ix_point_levels_org_id", table_name="point_levels")
    op.drop_table("point_levels")

    op.drop_index("ux_point_rules_module_event", table_name="point_rules")
    op.drop_index("ux_point_rules_course_event", table_name="point_rules")
    op.drop_index("ix_point_rules_org_id", table_name="point_rules")
    op.drop_table("point_rules")
    sa.Enum(name="ruleevent").drop(op.get_bind())
    sa.Enum(name="rulescope").drop(op.get_bind())

    op.drop_column("orgs", "default_perfect_quiz_points")
    op.drop_column("orgs", "default_course_points")
    op.drop_column("orgs", "default_module_points")

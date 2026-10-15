"""module restrictions: completion_module_ids (replaces completion_module_id),
module.restrictions JSONB, users.country

Revision ID: 7b1f4a2c9d3e
Revises: 50e8c8c8f1a0
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "7b1f4a2c9d3e"
down_revision = "50e8c8c8f1a0"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # completion_module_id (single FK) -> completion_module_ids (plain
    # UUID array, like skill_ids/badge_ids) — lets an admin require more
    # than one module to gate completion, not just exactly one.
    op.drop_constraint("fk_courses_completion_module_id", "courses", type_="foreignkey")
    op.add_column(
        "courses",
        sa.Column(
            "completion_module_ids",
            sa.dialects.postgresql.ARRAY(sa.dialects.postgresql.UUID(as_uuid=True)),
            nullable=False, server_default="{}",
        ),
    )
    # Best-effort carry-over: a course that already had a single
    # completion_module_id set keeps behaving the same way, as a
    # one-element list, instead of silently reverting to "all required".
    op.execute("""
        UPDATE courses SET completion_module_ids = ARRAY[completion_module_id]
        WHERE completion_module_id IS NOT NULL
    """)
    op.drop_column("courses", "completion_module_id")

    op.add_column(
        "modules",
        sa.Column("restrictions", sa.dialects.postgresql.JSONB(), nullable=False, server_default="[]"),
    )
    op.add_column("users", sa.Column("country", sa.String(length=100), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "country")
    op.drop_column("modules", "restrictions")
    op.add_column(
        "courses",
        sa.Column("completion_module_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute("""
        UPDATE courses SET completion_module_id = completion_module_ids[1]
        WHERE array_length(completion_module_ids, 1) IS NOT NULL
    """)
    op.create_foreign_key(
        "fk_courses_completion_module_id", "courses", "modules",
        ["completion_module_id"], ["id"], ondelete="SET NULL",
    )
    op.drop_column("courses", "completion_module_ids")

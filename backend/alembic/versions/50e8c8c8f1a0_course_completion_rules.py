"""course completion rules: completion_module_id + sequential_unlock

Revision ID: 50e8c8c8f1a0
Revises: 8f2c6d4a9e17
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "50e8c8c8f1a0"
down_revision = "8f2c6d4a9e17"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "courses",
        sa.Column("completion_module_id", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_courses_completion_module_id", "courses", "modules",
        ["completion_module_id"], ["id"], ondelete="SET NULL",
    )
    op.add_column(
        "courses",
        sa.Column("sequential_unlock", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("courses", "sequential_unlock")
    op.drop_constraint("fk_courses_completion_module_id", "courses", type_="foreignkey")
    op.drop_column("courses", "completion_module_id")

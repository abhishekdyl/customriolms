"""Add SCORM completion-criteria flags on modules (Moodle-style)

Revision ID: b4f1a8e6c3d7
Revises: a7c2e5f9d3b1
Create Date: 2026-10-21

"""
from alembic import op
import sqlalchemy as sa

revision = "b4f1a8e6c3d7"
down_revision = "a7c2e5f9d3b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("modules", sa.Column("scorm_completion_view", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("modules", sa.Column("scorm_completion_passed", sa.Boolean(), nullable=False, server_default="false"))
    # True server-default — every module that existed before this setting
    # did was always gated on "the package reports SOME terminal status",
    # so backfilling true here keeps every existing SCORM module's
    # completion behavior unchanged.
    op.add_column("modules", sa.Column("scorm_completion_completed", sa.Boolean(), nullable=False, server_default="true"))
    op.add_column("modules", sa.Column("scorm_completion_graded", sa.Boolean(), nullable=False, server_default="false"))


def downgrade() -> None:
    op.drop_column("modules", "scorm_completion_graded")
    op.drop_column("modules", "scorm_completion_completed")
    op.drop_column("modules", "scorm_completion_passed")
    op.drop_column("modules", "scorm_completion_view")

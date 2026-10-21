"""Add scorm_progress (per-learner resumable SCORM module state)

Revision ID: a7c2e5f9d3b1
Revises: f1a9d4c27b63
Create Date: 2026-10-21

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a7c2e5f9d3b1"
down_revision = "a7b3f2e9c1d4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "scorm_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("module_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("modules.id"), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("cmi_data", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "module_id", name="uq_scorm_progress_user_module"),
    )
    op.create_index("ix_scorm_progress_org_id", "scorm_progress", ["org_id"])
    op.create_index("ix_scorm_progress_user_id", "scorm_progress", ["user_id"])
    op.create_index("ix_scorm_progress_module_id", "scorm_progress", ["module_id"])


def downgrade() -> None:
    op.drop_index("ix_scorm_progress_module_id", table_name="scorm_progress")
    op.drop_index("ix_scorm_progress_user_id", table_name="scorm_progress")
    op.drop_index("ix_scorm_progress_org_id", table_name="scorm_progress")
    op.drop_table("scorm_progress")

"""Add module_attempt_overrides (per-learner extra retake attempts)

Revision ID: cb3c10b2c523
Revises: a29ddd09d64f
Create Date: 2026-10-19

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "cb3c10b2c523"
down_revision = "a29ddd09d64f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "module_attempt_overrides",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("module_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("modules.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("extra_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("module_id", "user_id", name="uq_attempt_override_module_user"),
    )
    op.create_index("ix_module_attempt_overrides_org_id", "module_attempt_overrides", ["org_id"])
    op.create_index("ix_module_attempt_overrides_module_id", "module_attempt_overrides", ["module_id"])
    op.create_index("ix_module_attempt_overrides_user_id", "module_attempt_overrides", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_module_attempt_overrides_user_id", table_name="module_attempt_overrides")
    op.drop_index("ix_module_attempt_overrides_module_id", table_name="module_attempt_overrides")
    op.drop_index("ix_module_attempt_overrides_org_id", table_name="module_attempt_overrides")
    op.drop_table("module_attempt_overrides")

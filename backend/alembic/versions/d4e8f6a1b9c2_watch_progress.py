"""Add watch_progress (per-learner resumable WATCH module state)

Revision ID: d4e8f6a1b9c2
Revises: cb3c10b2c523
Create Date: 2026-10-19

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d4e8f6a1b9c2"
down_revision = "cb3c10b2c523"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "watch_progress",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("module_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("modules.id"), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("furthest_pct", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("answers_json", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("user_id", "module_id", name="uq_watch_progress_user_module"),
    )
    op.create_index("ix_watch_progress_org_id", "watch_progress", ["org_id"])
    op.create_index("ix_watch_progress_user_id", "watch_progress", ["user_id"])
    op.create_index("ix_watch_progress_module_id", "watch_progress", ["module_id"])


def downgrade() -> None:
    op.drop_index("ix_watch_progress_module_id", table_name="watch_progress")
    op.drop_index("ix_watch_progress_user_id", table_name="watch_progress")
    op.drop_index("ix_watch_progress_org_id", table_name="watch_progress")
    op.drop_table("watch_progress")

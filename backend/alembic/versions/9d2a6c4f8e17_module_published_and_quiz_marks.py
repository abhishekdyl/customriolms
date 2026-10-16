"""modules.published draft/publish gate, quiz_attempts earned/total marks

Revision ID: 9d2a6c4f8e17
Revises: 7c4f1b8e3a92
Create Date: 2026-10-16

Plain Boolean/Integer columns, no new enum type — same reasoning as
7c4f1b8e3a92, ordinary op.add_column/op.drop_column is enough.
"""
from alembic import op
import sqlalchemy as sa

revision = "9d2a6c4f8e17"
down_revision = "7c4f1b8e3a92"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # server_default "true" so every existing module (already fully
    # authored, already visible to learners) stays visible after this
    # migration — only a module created after this ships starts as a
    # draft (add_module sets published=False explicitly in code).
    op.add_column("modules", sa.Column("published", sa.Boolean(), nullable=False, server_default=sa.true()))

    op.add_column("quiz_attempts", sa.Column("earned_points", sa.Integer(), nullable=True))
    op.add_column("quiz_attempts", sa.Column("total_points", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("quiz_attempts", "total_points")
    op.drop_column("quiz_attempts", "earned_points")
    op.drop_column("modules", "published")

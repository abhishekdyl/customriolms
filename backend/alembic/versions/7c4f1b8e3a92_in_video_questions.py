"""in-video questions for WATCH modules: trigger time, display timer,
points, and a module-level min-correct-count completion gate

Revision ID: 7c4f1b8e3a92
Revises: 2b7e4f9a1c56
Create Date: 2026-10-16

Plain Integer columns only (no new enum type), so unlike the last two
migrations this one uses ordinary op.add_column/op.drop_column — the
raw-SQL workaround was only ever needed for enum-type DDL colliding with
this project's migration chain (see 4b7e9a2f1c83's and 2b7e4f9a1c56's
comments), which doesn't apply here.
"""
from alembic import op
import sqlalchemy as sa

revision = "7c4f1b8e3a92"
down_revision = "2b7e4f9a1c56"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("modules", sa.Column("video_question_min_correct", sa.Integer(), nullable=True))

    op.add_column("module_quiz_questions", sa.Column("trigger_time_sec", sa.Integer(), nullable=True))
    op.add_column("module_quiz_questions", sa.Column("timer_seconds", sa.Integer(), nullable=True))
    op.add_column("module_quiz_questions", sa.Column("points", sa.Integer(), nullable=False, server_default="1"))


def downgrade() -> None:
    op.drop_column("module_quiz_questions", "points")
    op.drop_column("module_quiz_questions", "timer_seconds")
    op.drop_column("module_quiz_questions", "trigger_time_sec")

    op.drop_column("modules", "video_question_min_correct")

"""quiz_attempts: pass/fail + per-question answer detail

Revision ID: 8f2c6d4a9e17
Revises: 4b7e9a2f1c83

A QuizAttempt row has always recorded every submission (score,
timestamp), but not whether it passed or what was actually answered —
so there was no way for an Org Admin/Team Lead to see what a learner
got wrong. This adds:

- `passed` — the pass/fail this specific attempt computed against the
  module's threshold at the time (a module's threshold can change
  later; this keeps old attempts' pass/fail from silently flipping).
- `answers_json` — a snapshot of each question (text/type/options as
  they were at submission time) plus what the learner picked and
  whether it was correct. A snapshot, not a live join back to
  module_quiz_questions, so a later edit or deletion of a question
  never changes what an admin sees for a past attempt.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "8f2c6d4a9e17"
down_revision: Union[str, None] = "4b7e9a2f1c83"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("quiz_attempts", sa.Column("passed", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column(
        "quiz_attempts",
        sa.Column("answers_json", sa.dialects.postgresql.JSONB(), nullable=False, server_default=sa.text("'[]'::jsonb")),
    )


def downgrade() -> None:
    op.drop_column("quiz_attempts", "answers_json")
    op.drop_column("quiz_attempts", "passed")

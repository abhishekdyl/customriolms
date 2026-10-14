"""add courses.opens_at / closes_at

Revision ID: 33cd0302e544
Revises: b2f6a914c3e0

Both nullable, no default — a pure additive change. opens_at gates
when a learner can start a course; closes_at is a hard cutoff after
which no new assignment or further learner progress is allowed.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "33cd0302e544"
down_revision: Union[str, None] = "b2f6a914c3e0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("opens_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("courses", sa.Column("closes_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("courses", "closes_at")
    op.drop_column("courses", "opens_at")

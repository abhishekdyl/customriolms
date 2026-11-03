"""Add modules.weight and courses.pass_mark — Gradebook aggregation

Revision ID: f4b8d2a67c91
Revises: a7c3e9f1d6b4
Create Date: 2026-11-03

"""
from alembic import op
import sqlalchemy as sa

revision = "f4b8d2a67c91"
down_revision = "a7c3e9f1d6b4"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("modules", sa.Column("weight", sa.Integer(), nullable=False, server_default=sa.text("1")))
    op.add_column("courses", sa.Column("pass_mark", sa.Integer(), nullable=False, server_default=sa.text("50")))


def downgrade() -> None:
    op.drop_column("courses", "pass_mark")
    op.drop_column("modules", "weight")

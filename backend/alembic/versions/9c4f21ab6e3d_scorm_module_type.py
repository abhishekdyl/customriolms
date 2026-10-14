"""add scorm module type + modules.scorm_launch_path/scorm_version

Revision ID: 9c4f21ab6e3d
Revises: 7a19e2b6f401

Adds the "scorm" value to the moduletype enum and two nullable columns
for a SCORM package's launch file path and SCORM version. Pure
additive — no existing row's type changes.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "9c4f21ab6e3d"
down_revision: Union[str, None] = "7a19e2b6f401"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Postgres enums can't add a value inside the same transaction a
    # dependent column is added in on older server versions, but ALTER
    # TYPE ... ADD VALUE on its own is safe to run directly.
    # SQLAlchemy stores a Python str-Enum's *member name* in Postgres by
    # default, not its .value — hence 'SCORM' (uppercase) here, matching
    # the existing WATCH/READ/QUIZ/MANUAL values, not the lowercase
    # "scorm" used as ModuleType.SCORM's Python-side value.
    op.execute("ALTER TYPE moduletype ADD VALUE IF NOT EXISTS 'SCORM'")
    op.add_column("modules", sa.Column("scorm_launch_path", sa.String(length=500), nullable=True))
    op.add_column("modules", sa.Column("scorm_version", sa.String(length=20), nullable=True))


def downgrade() -> None:
    op.drop_column("modules", "scorm_version")
    op.drop_column("modules", "scorm_launch_path")
    # Postgres has no "DROP VALUE" for enums — removing 'scorm' from
    # moduletype would require rebuilding the type and is intentionally
    # left out; any existing SCORM module rows would need migrating off
    # the type first anyway.

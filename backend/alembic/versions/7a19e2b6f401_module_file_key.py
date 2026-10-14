"""add modules.file_key

Revision ID: 7a19e2b6f401
Revises: 33cd0302e544

Pure additive. Stores the permanent R2/S3 object key for a module's
uploaded content; file_url is now always recomputed from this at
serialization time (a presigned URL would otherwise expire), so the
old `file_url` column stops being written to going forward but is
left in place for any pre-existing row.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "7a19e2b6f401"
down_revision: Union[str, None] = "33cd0302e544"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("modules", sa.Column("file_key", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("modules", "file_key")

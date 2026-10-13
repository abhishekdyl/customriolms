"""cert template background_url to text

Revision ID: e3b7c19a5d28
Revises: c7a2d8e14f39
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e3b7c19a5d28"
down_revision: Union[str, None] = "c7a2d8e14f39"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("cert_templates", "background_url", existing_type=sa.String(length=500), type_=sa.Text(), existing_nullable=True)


def downgrade() -> None:
    op.alter_column("cert_templates", "background_url", existing_type=sa.Text(), type_=sa.String(length=500), existing_nullable=True)

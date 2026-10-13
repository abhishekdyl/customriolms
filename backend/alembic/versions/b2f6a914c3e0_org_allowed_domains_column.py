"""add missing orgs.allowed_domains column (now a no-op)

Revision ID: b2f6a914c3e0
Revises: a8c5e2d91f47

This used to run `ALTER TABLE orgs ADD COLUMN allowed_domains ...`. That's
now a duplicate: c7a2d8e14f39 ("add org profile fields") already adds the
same column earlier in the chain, so on a fresh install this migration
used to fail with "column already exists".

Left as a no-op revision (not deleted) because production databases that
migrated before this fix already have "b2f6a914c3e0" recorded in
alembic_version — deleting the file would break their next `alembic
upgrade head` with "Can't locate revision identified by 'b2f6a914c3e0'".
A no-op keeps the chain intact for them while fixing fresh installs.
"""
from typing import Sequence, Union

revision: str = "b2f6a914c3e0"
down_revision: Union[str, None] = "a8c5e2d91f47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass

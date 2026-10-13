"""add missing orgs.allowed_domains column

Revision ID: b2f6a914c3e0
Revises: a8c5e2d91f47

The Org model (app/models/org.py) has declared `allowed_domains` since the
domain-restriction feature was designed, but no earlier migration actually
added the column — 72f6cab0b642 added plan/status/user_limit/created_at and
stopped there. Any INSERT that includes it (org creation, PATCH /orgs/me)
fails with "column does not exist" until this runs. Found while testing the
learner-role work in this patch; unrelated to it, but blocking, so fixed here.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b2f6a914c3e0"
down_revision: Union[str, None] = "a8c5e2d91f47"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "orgs",
        sa.Column("allowed_domains", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
    )


def downgrade() -> None:
    op.drop_column("orgs", "allowed_domains")

"""add org profile fields (industry, timezone, contact_email, logo_url, allowed_domains)

Revision ID: c7a2d8e14f39
Revises: d864104467e9
Create Date: 2026-09-22 09:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c7a2d8e14f39'
down_revision: Union[str, None] = 'd864104467e9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Backs the Org Settings page (app/models/org.py) — an Org Admin's own
    # profile fields, separate from plan/status/user_limit which only the
    # platform Super Admin can change.
    op.add_column('orgs', sa.Column('industry', sa.String(length=100), nullable=True))
    op.add_column('orgs', sa.Column('timezone', sa.String(length=50), nullable=False, server_default='UTC'))
    op.add_column('orgs', sa.Column('contact_email', sa.String(length=255), nullable=True))
    op.add_column('orgs', sa.Column('logo_url', sa.String(length=500), nullable=True))
    op.add_column(
        'orgs',
        sa.Column('allowed_domains', postgresql.ARRAY(sa.String()), nullable=False, server_default='{}'),
    )


def downgrade() -> None:
    op.drop_column('orgs', 'allowed_domains')
    op.drop_column('orgs', 'logo_url')
    op.drop_column('orgs', 'contact_email')
    op.drop_column('orgs', 'timezone')
    op.drop_column('orgs', 'industry')

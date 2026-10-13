"""add org plan status fields

Revision ID: 72f6cab0b642
Revises: 66d05703af37
Create Date: 2026-09-17 13:21:56.320534

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = '72f6cab0b642'
down_revision: Union[str, None] = '66d05703af37'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # Postgres needs these enum "types" created explicitly before a
    # column can use them — unlike CREATE TABLE, ADD COLUMN doesn't do
    # this automatically.
    org_plan_enum = postgresql.ENUM('STARTER', 'GROWTH', 'ENTERPRISE', name='orgplan')
    org_plan_enum.create(bind, checkfirst=True)
    org_status_enum = postgresql.ENUM('ACTIVE', 'TRIAL', 'SUSPENDED', name='orgstatus')
    org_status_enum.create(bind, checkfirst=True)

    op.create_table('platform_settings',
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('allow_self_serve_signup', sa.Boolean(), nullable=False),
    sa.PrimaryKeyConstraint('id')
    )
    op.add_column('orgs', sa.Column('plan', sa.Enum('STARTER', 'GROWTH', 'ENTERPRISE', name='orgplan', create_type=False), nullable=False, server_default='STARTER'))
    op.add_column('orgs', sa.Column('status', sa.Enum('ACTIVE', 'TRIAL', 'SUSPENDED', name='orgstatus', create_type=False), nullable=False, server_default='TRIAL'))
    op.add_column('orgs', sa.Column('user_limit', sa.Integer(), nullable=False, server_default='20'))
    op.add_column('orgs', sa.Column('created_at', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('now()')))


def downgrade() -> None:
    op.drop_column('orgs', 'created_at')
    op.drop_column('orgs', 'user_limit')
    op.drop_column('orgs', 'status')
    op.drop_column('orgs', 'plan')
    op.drop_table('platform_settings')

    bind = op.get_bind()
    postgresql.ENUM(name='orgstatus').drop(bind, checkfirst=True)
    postgresql.ENUM(name='orgplan').drop(bind, checkfirst=True)

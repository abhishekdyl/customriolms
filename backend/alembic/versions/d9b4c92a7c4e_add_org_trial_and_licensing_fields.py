"""add org trial and licensing fields

Revision ID: d9b4c92a7c4e
Revises: a3c7e9f21d4b
Create Date: 2026-11-06 13:37:10.895909

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'd9b4c92a7c4e'
down_revision: Union[str, None] = 'a3c7e9f21d4b'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("orgs", sa.Column("trial_ends_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("orgs", sa.Column("suspension_reason", sa.String(30), nullable=True))

    op.add_column("platform_settings", sa.Column("trial_days", sa.Integer(), nullable=False, server_default="15"))
    op.add_column("platform_settings", sa.Column("price_starter_monthly", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("platform_settings", sa.Column("price_growth_monthly", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("platform_settings", sa.Column("price_enterprise_monthly", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("platform_settings", sa.Column("razorpay_key_id", sa.String(100), nullable=True))
    op.add_column("platform_settings", sa.Column("razorpay_key_secret", sa.String(200), nullable=True))
    op.add_column("platform_settings", sa.Column("razorpay_webhook_secret", sa.String(200), nullable=True))

    org_payment_status = postgresql.ENUM("created", "paid", "failed", name="orgpaymentstatus", create_type=False)
    postgresql.ENUM("created", "paid", "failed", name="orgpaymentstatus").create(op.get_bind(), checkfirst=True)
    op.create_table(
        "org_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("plan", postgresql.ENUM("starter", "growth", "enterprise", name="orgplan", create_type=False), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(10), nullable=False, server_default="INR"),
        sa.Column("razorpay_order_id", sa.String(100), nullable=False),
        sa.Column("razorpay_payment_id", sa.String(100), nullable=True),
        sa.Column("razorpay_signature", sa.String(200), nullable=True),
        sa.Column("status", org_payment_status, nullable=False, server_default="created"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_org_payments_org_id", "org_payments", ["org_id"])
    op.create_index("ix_org_payments_razorpay_order_id", "org_payments", ["razorpay_order_id"])


def downgrade() -> None:
    op.drop_index("ix_org_payments_razorpay_order_id", table_name="org_payments")
    op.drop_index("ix_org_payments_org_id", table_name="org_payments")
    op.drop_table("org_payments")
    sa.Enum(name="orgpaymentstatus").drop(op.get_bind())

    op.drop_column("platform_settings", "razorpay_webhook_secret")
    op.drop_column("platform_settings", "razorpay_key_secret")
    op.drop_column("platform_settings", "razorpay_key_id")
    op.drop_column("platform_settings", "price_enterprise_monthly")
    op.drop_column("platform_settings", "price_growth_monthly")
    op.drop_column("platform_settings", "price_starter_monthly")
    op.drop_column("platform_settings", "trial_days")

    op.drop_column("orgs", "suspension_reason")
    op.drop_column("orgs", "trial_ends_at")

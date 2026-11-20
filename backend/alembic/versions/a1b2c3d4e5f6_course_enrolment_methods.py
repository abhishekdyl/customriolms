"""Course enrolment methods — self-enrol (with restrictions) + paid enrol

Revision ID: a1b2c3d4e5f6
Revises: c3f7a8e21d45
Create Date: 2026-11-20 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "c3f7a8e21d45"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("courses", sa.Column("self_enrol_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column(
        "courses", sa.Column("self_enrol_allowed_countries", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}")
    )
    op.add_column(
        "courses", sa.Column("self_enrol_required_course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=True)
    )
    op.add_column("courses", sa.Column("paid_enrol_enabled", sa.Boolean(), nullable=False, server_default="false"))
    op.add_column("courses", sa.Column("paid_enrol_price", sa.Integer(), nullable=True))

    op.create_table(
        "course_enrolment_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("course_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("courses.id"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Integer(), nullable=False),
        sa.Column("currency", sa.String(length=10), nullable=False, server_default="INR"),
        sa.Column("razorpay_order_id", sa.String(length=100), nullable=False),
        sa.Column("razorpay_payment_id", sa.String(length=100), nullable=True),
        sa.Column("razorpay_signature", sa.String(length=200), nullable=True),
        sa.Column(
            "status", sa.Enum("CREATED", "PAID", "FAILED", name="courseenrolmentpaymentstatus"),
            nullable=False, server_default="CREATED",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("paid_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index("ix_course_enrolment_payments_org_id", "course_enrolment_payments", ["org_id"])
    op.create_index("ix_course_enrolment_payments_course_id", "course_enrolment_payments", ["course_id"])
    op.create_index("ix_course_enrolment_payments_user_id", "course_enrolment_payments", ["user_id"])
    op.create_index("ix_course_enrolment_payments_razorpay_order_id", "course_enrolment_payments", ["razorpay_order_id"])


def downgrade() -> None:
    op.drop_index("ix_course_enrolment_payments_razorpay_order_id", table_name="course_enrolment_payments")
    op.drop_index("ix_course_enrolment_payments_user_id", table_name="course_enrolment_payments")
    op.drop_index("ix_course_enrolment_payments_course_id", table_name="course_enrolment_payments")
    op.drop_index("ix_course_enrolment_payments_org_id", table_name="course_enrolment_payments")
    op.drop_table("course_enrolment_payments")
    sa.Enum(name="courseenrolmentpaymentstatus").drop(op.get_bind())

    op.drop_column("courses", "paid_enrol_price")
    op.drop_column("courses", "paid_enrol_enabled")
    op.drop_column("courses", "self_enrol_required_course_id")
    op.drop_column("courses", "self_enrol_allowed_countries")
    op.drop_column("courses", "self_enrol_enabled")

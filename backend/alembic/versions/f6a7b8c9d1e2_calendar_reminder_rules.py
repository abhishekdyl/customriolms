"""Calendar-based reminder rules: on_date/weekly/monthly recurrence, target scope, dispatcher bookkeeping

Revision ID: f6a7b8c9d1e2
Revises: e5f6a7b8c9d1
Create Date: 2026-11-20 00:00:00.000000
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "f6a7b8c9d1e2"
down_revision: Union[str, None] = "e5f6a7b8c9d1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("reminder_rules", sa.Column("fire_time", sa.String(length=5), nullable=False, server_default="09:00"))
    op.add_column("reminder_rules", sa.Column("fire_date", sa.Date(), nullable=True))
    op.add_column("reminder_rules", sa.Column("interval", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("reminder_rules", sa.Column("days_of_week", postgresql.ARRAY(sa.Integer()), nullable=False, server_default="{}"))
    op.add_column("reminder_rules", sa.Column("day_of_month", sa.Integer(), nullable=True))
    op.add_column("reminder_rules", sa.Column("end_date", sa.Date(), nullable=True))
    op.add_column("reminder_rules", sa.Column("target_scope", sa.String(length=10), nullable=False, server_default="all"))
    op.add_column("reminder_rules", sa.Column("course_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column("reminder_rules", sa.Column("subject", sa.String(length=300), nullable=False, server_default="Reminder"))
    op.add_column("reminder_rules", sa.Column("message", sa.Text(), nullable=False, server_default="This is a scheduled reminder."))
    op.add_column("reminder_rules", sa.Column("next_fire_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("reminder_rules", sa.Column("last_fired_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key("fk_reminder_rules_course_id", "reminder_rules", "courses", ["course_id"], ["id"])
    op.create_index("ix_reminder_rules_next_fire_at", "reminder_rules", ["next_fire_at"])

    # The old weekly_digest trigger never actually fired anything (no
    # dispatcher existed before this) — convert any existing rows to the
    # closest new equivalent (weekly, Monday, kept disabled) rather than
    # leaving a dead trigger value around; nothing is lost since nothing
    # ever read/sent them.
    op.execute(
        "UPDATE reminder_rules SET trigger = 'weekly', days_of_week = '{0}', enabled = false "
        "WHERE trigger = 'weekly_digest'"
    )


def downgrade() -> None:
    op.drop_index("ix_reminder_rules_next_fire_at", table_name="reminder_rules")
    op.drop_constraint("fk_reminder_rules_course_id", "reminder_rules", type_="foreignkey")
    op.drop_column("reminder_rules", "last_fired_at")
    op.drop_column("reminder_rules", "next_fire_at")
    op.drop_column("reminder_rules", "message")
    op.drop_column("reminder_rules", "subject")
    op.drop_column("reminder_rules", "course_id")
    op.drop_column("reminder_rules", "target_scope")
    op.drop_column("reminder_rules", "end_date")
    op.drop_column("reminder_rules", "day_of_month")
    op.drop_column("reminder_rules", "days_of_week")
    op.drop_column("reminder_rules", "interval")
    op.drop_column("reminder_rules", "fire_date")
    op.drop_column("reminder_rules", "fire_time")

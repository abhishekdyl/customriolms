"""fix orgpaymentstatus enum case to match model

Revision ID: 10a9e1ea7ce4
Revises: d9b4c92a7c4e
Create Date: 2026-11-16 12:40:00.000000

The previous migration created the Postgres `orgpaymentstatus` enum with
lowercase labels ("created", "paid", "failed"), but the SQLAlchemy model
(OrgPaymentStatus, a str Enum) sends the Python enum member's *name* —
"CREATED", "PAID", "FAILED" — not its `.value`, same as every other enum
column in this codebase (OrgStatus/OrgPlan on Org, which is why `orgs`
already stores "TRIAL"/"STARTER" in uppercase). That mismatch made every
insert into org_payments fail with
`invalid input value for enum orgpaymentstatus: "CREATED"` the moment
POST /billing/checkout tried to write its first row. Nothing could have
committed successfully before this fix (every attempt rolled back), so
this just renames the existing labels — no data to migrate.
"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '10a9e1ea7ce4'
down_revision: Union[str, None] = 'd9b4c92a7c4e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE orgpaymentstatus RENAME VALUE 'created' TO 'CREATED'")
    op.execute("ALTER TYPE orgpaymentstatus RENAME VALUE 'paid' TO 'PAID'")
    op.execute("ALTER TYPE orgpaymentstatus RENAME VALUE 'failed' TO 'FAILED'")
    op.execute("ALTER TABLE org_payments ALTER COLUMN status SET DEFAULT 'CREATED'")


def downgrade() -> None:
    # Rename the labels back first — the column's default is still
    # 'CREATED' at this point, so setting it to 'created' before the
    # label exists under that name fails the same way the original bug
    # did (invalid input value for enum orgpaymentstatus: "created").
    op.execute("ALTER TYPE orgpaymentstatus RENAME VALUE 'CREATED' TO 'created'")
    op.execute("ALTER TYPE orgpaymentstatus RENAME VALUE 'PAID' TO 'paid'")
    op.execute("ALTER TYPE orgpaymentstatus RENAME VALUE 'FAILED' TO 'failed'")
    op.execute("ALTER TABLE org_payments ALTER COLUMN status SET DEFAULT 'created'")

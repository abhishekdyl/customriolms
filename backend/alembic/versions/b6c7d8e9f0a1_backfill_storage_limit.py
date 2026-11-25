"""Backfill Org.storage_limit_mb to each org's actual plan default

The previous migration (f4a5b6c7d8e9) added storage_limit_mb with a
flat server_default of 5120 for every existing row — correct only for
Starter. A Growth org read as capped at 5GB (its real quota is 20GB),
an Enterprise org at 5GB instead of 100GB, etc. New orgs created after
that migration already got the right per-plan value (orgs.py/auth.py
set it explicitly on create) — this is a one-time fix for rows that
existed before storage_limit_mb did. Safe to apply unconditionally: the
column is brand new, so no Super Admin has had a chance to deliberately
customize an individual org's quota away from its plan default yet.

Revision ID: b6c7d8e9f0a1
Revises: a5b6c7d8e9f0
Create Date: 2026-11-25
"""
from alembic import op
from sqlalchemy import text

revision = "b6c7d8e9f0a1"
down_revision = "a5b6c7d8e9f0"
branch_labels = None
depends_on = None

# Postgres stores this enum column by the Python Enum member's NAME
# (FREE/STARTER/GROWTH/ENTERPRISE), not its lowercase .value — matching
# how SQLAlchemy's Enum(OrgPlan, ...) column (no values_callable) was
# declared in models/org.py.
PLAN_STORAGE_LIMITS_MB = {"FREE": 1024, "STARTER": 5120, "GROWTH": 20480, "ENTERPRISE": 102400}


def upgrade() -> None:
    # 'FREE' was added to the orgplan enum by an earlier migration
    # (fadcfaf396ed) — Postgres refuses to let a freshly-added enum
    # value be used for comparison within the same transaction it was
    # added in, which bites here only because this project's env.py
    # runs every pending migration over one shared connection/
    # transaction (see alembic/env.py's run_migrations_online) rather
    # than one transaction per revision. autocommit_block() forces this
    # migration's own statements onto a separate, already-committed
    # transaction, same as Alembic's own docs recommend whenever a
    # migration needs to USE an enum value another migration just added.
    with op.get_context().autocommit_block():
        conn = op.get_bind()
        for plan, mb in PLAN_STORAGE_LIMITS_MB.items():
            conn.execute(text("UPDATE orgs SET storage_limit_mb = :mb WHERE plan = :plan"), {"mb": mb, "plan": plan})


def downgrade() -> None:
    # Backfilling data isn't meaningfully reversible (we'd be guessing
    # what it was before) — leaving storage_limit_mb as-is on downgrade.
    pass

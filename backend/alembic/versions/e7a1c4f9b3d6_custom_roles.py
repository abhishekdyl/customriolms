"""custom roles

Revision ID: e7a1c4f9b3d6
Revises: d3e9f6a2c8b1
Create Date: 2026-11-04 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "e7a1c4f9b3d6"
down_revision = "d3e9f6a2c8b1"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New enum member on the existing `rolename` PG type — ADD VALUE can't
    # run inside the same transaction that later reads it (Alembic wraps
    # each migration in one), so it's committed on its own via autocommit
    # before the rest of this migration runs.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE rolename ADD VALUE IF NOT EXISTS 'CUSTOM'")

    op.create_table(
        "custom_roles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(300), nullable=False, server_default=""),
        sa.Column("scope", sa.String(20), nullable=False, server_default="org"),
        sa.Column("capabilities", postgresql.ARRAY(sa.String()), nullable=False, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_custom_roles_org_id", "custom_roles", ["org_id"])

    op.add_column("users", sa.Column("custom_role_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_users_custom_role_id", "users", "custom_roles", ["custom_role_id"], ["id"])


def downgrade() -> None:
    op.drop_constraint("fk_users_custom_role_id", "users", type_="foreignkey")
    op.drop_column("users", "custom_role_id")
    op.drop_index("ix_custom_roles_org_id", table_name="custom_roles")
    op.drop_table("custom_roles")
    # Postgres can't drop a single enum value — the 'CUSTOM' label stays
    # on the `rolename` type after a downgrade. Harmless: nothing writes
    # it once this migration is reverted.

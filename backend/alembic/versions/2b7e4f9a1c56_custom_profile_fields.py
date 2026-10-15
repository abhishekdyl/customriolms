"""custom profile fields: user_info_fields (org-admin-defined) + user_info_data (per-user values)

Revision ID: 2b7e4f9a1c56
Revises: 9f3d2c6b1a84
Create Date: 2026-10-15

Written with plain SQL throughout for the same reason as
4b7e9a2f1c83's migration: op.create_table colliding with SQLAlchemy's
enum-type auto-create DDL event against this project's full chain.
"""
from alembic import op

revision = "2b7e4f9a1c56"
down_revision = "9f3d2c6b1a84"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLAlchemy's Enum sends the Python member NAME, not its .value
    # (matching this project's convention elsewhere — see e.g. rolename's
    # SUPER_ADMIN/ORG_ADMIN/... in the initial migration), so the Postgres
    # enum's labels are uppercase even though ProfileFieldType's values
    # (and everything the API sends/returns) are lowercase.
    op.execute("CREATE TYPE profilefieldtype AS ENUM ('INPUT', 'TEXTAREA', 'CHECKBOX', 'RADIO', 'SELECT')")

    op.execute("""
        CREATE TABLE user_info_fields (
            id UUID PRIMARY KEY,
            org_id UUID NOT NULL REFERENCES orgs(id),
            shortname VARCHAR(100) NOT NULL,
            name VARCHAR(200) NOT NULL,
            field_type profilefieldtype NOT NULL,
            options VARCHAR[] NOT NULL DEFAULT '{}',
            required BOOLEAN NOT NULL DEFAULT false,
            sortorder INTEGER NOT NULL DEFAULT 0,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_user_info_fields_org_shortname UNIQUE (org_id, shortname)
        )
    """)
    op.execute("CREATE INDEX ix_user_info_fields_org_id ON user_info_fields (org_id)")

    op.execute("""
        CREATE TABLE user_info_data (
            id UUID PRIMARY KEY,
            field_id UUID NOT NULL REFERENCES user_info_fields(id) ON DELETE CASCADE,
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            value TEXT,
            CONSTRAINT uq_user_info_data_field_user UNIQUE (field_id, user_id)
        )
    """)
    op.execute("CREATE INDEX ix_user_info_data_field_id ON user_info_data (field_id)")
    op.execute("CREATE INDEX ix_user_info_data_user_id ON user_info_data (user_id)")


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS user_info_data")
    op.execute("DROP TABLE IF EXISTS user_info_fields")
    op.execute("DROP TYPE IF EXISTS profilefieldtype")

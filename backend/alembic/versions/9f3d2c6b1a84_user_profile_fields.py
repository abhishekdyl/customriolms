"""user profile core fields: username/firstname/lastname (replaces name),
city/timezone/companyname/avatar_key, orgs.allow_custom_username

Revision ID: 9f3d2c6b1a84
Revises: 4e8a1c7f6b2d
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "9f3d2c6b1a84"
down_revision = "4e8a1c7f6b2d"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("firstname", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("lastname", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("username", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("city", sa.String(length=100), nullable=True))
    op.add_column("users", sa.Column("timezone", sa.String(length=50), nullable=True))
    op.add_column("users", sa.Column("companyname", sa.String(length=200), nullable=True))
    op.add_column("users", sa.Column("avatar_key", sa.String(length=500), nullable=True))

    # Backfill: firstname = first whitespace-separated token of the old
    # `name`, lastname = everything after it — same split rule as
    # app.models.user.split_full_name (first word vs. the rest), so
    # existing data lines up exactly with how new rows are created.
    op.execute("""
        UPDATE users SET
            firstname = COALESCE(split_part(btrim(name), ' ', 1), ''),
            lastname = COALESCE(
                btrim(substring(btrim(name) from length(split_part(btrim(name), ' ', 1)) + 1)),
                ''
            )
        WHERE firstname IS NULL
    """)
    # username defaults to a copy of email for every existing user — see
    # Org.allow_custom_username for how a user later customizes it.
    op.execute("UPDATE users SET username = email WHERE username IS NULL")

    op.alter_column("users", "firstname", nullable=False)
    op.alter_column("users", "lastname", nullable=False, server_default="")
    op.alter_column("users", "username", nullable=False)
    op.create_unique_constraint("uq_users_username", "users", ["username"])
    op.create_index("ix_users_username", "users", ["username"])

    op.drop_column("users", "name")

    op.add_column(
        "orgs",
        sa.Column("allow_custom_username", sa.Boolean(), nullable=False, server_default=sa.false()),
    )


def downgrade() -> None:
    op.drop_column("orgs", "allow_custom_username")

    op.add_column("users", sa.Column("name", sa.String(length=200), nullable=True))
    op.execute("UPDATE users SET name = btrim(firstname || ' ' || lastname)")
    op.alter_column("users", "name", nullable=False)

    op.drop_index("ix_users_username", table_name="users")
    op.drop_constraint("uq_users_username", "users", type_="unique")
    op.drop_column("users", "avatar_key")
    op.drop_column("users", "companyname")
    op.drop_column("users", "timezone")
    op.drop_column("users", "city")
    op.drop_column("users", "username")
    op.drop_column("users", "lastname")
    op.drop_column("users", "firstname")

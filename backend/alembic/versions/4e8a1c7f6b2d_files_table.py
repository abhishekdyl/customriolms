"""files table: content-addressed upload registry (Moodle-style dedup ledger)

Revision ID: 4e8a1c7f6b2d
Revises: 7b1f4a2c9d3e
Create Date: 2026-10-15
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "4e8a1c7f6b2d"
down_revision = "7b1f4a2c9d3e"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "files",
        sa.Column("id", sa.dialects.postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("org_id", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("orgs.id"), nullable=False),
        sa.Column("contenthash", sa.String(length=64), nullable=False),
        sa.Column("pathnamehash", sa.String(length=64), nullable=False),
        sa.Column("component", sa.String(length=100), nullable=False),
        sa.Column("filearea", sa.String(length=100), nullable=False),
        sa.Column("itemid", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("filepath", sa.String(length=300), nullable=False, server_default="/"),
        sa.Column("filename", sa.String(length=300), nullable=False),
        sa.Column("userid", sa.dialects.postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("filesize", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("mimetype", sa.String(length=150), nullable=True),
        sa.Column("status", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("source", sa.String(length=500), nullable=True),
        sa.Column("author", sa.String(length=200), nullable=True),
        sa.Column("license", sa.String(length=100), nullable=False, server_default="unknown"),
        sa.Column("sortorder", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("referencefileid", sa.dialects.postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("timecreated", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("timemodified", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_files_org_id", "files", ["org_id"])
    op.create_index("ix_files_contenthash", "files", ["contenthash"])
    op.create_index("ix_files_itemid", "files", ["itemid"])
    op.create_unique_constraint("uq_files_pathnamehash", "files", ["pathnamehash"])


def downgrade() -> None:
    op.drop_table("files")

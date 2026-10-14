"""question banks + richer quiz questions (types, images, short answer)

Revision ID: 4b7e9a2f1c83
Revises: 9c4f21ab6e3d

Two things:
1. New question_banks / bank_questions tables — a reusable question
   library, independent of any one course.
2. module_quiz_questions grows a real question shape: `type` (mcq /
   true_false / short_answer), an optional image alongside/instead of
   text, options as a JSON list of {id, text, image_key} instead of a
   plain string array, and accepted_answers for short-answer scoring.

   The old `options` (string array) + `correct_index` (position in
   it) columns are replaced by `options_json` + `correct_option_id`
   (a stable id survives reordering; `correct_index` wouldn't). Every
   existing question is MCQ, so the data migration below converts
   every row before the old columns are dropped — nothing is lost,
   just reshaped.

   Written with plain SQL (op.execute) throughout rather than
   op.add_column/create_table for the enum-typed columns — SQLAlchemy's
   Enum type attaches a DDL event listener that tries to auto-create
   its Postgres type on any op.add_column/create_table touching it,
   and that fired even with create_type=False in testing against this
   project's full migration chain, colliding with the type this
   migration creates explicitly. Raw SQL has no such event system to
   fight, so it's what's actually reliable here.
"""
import json
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "4b7e9a2f1c83"
down_revision: Union[str, None] = "9c4f21ab6e3d"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    bind.execute(sa.text(
        "DO $$ BEGIN "
        "CREATE TYPE questiontype AS ENUM ('MCQ', 'TRUE_FALSE', 'SHORT_ANSWER'); "
        "EXCEPTION WHEN duplicate_object THEN NULL; "
        "END $$;"
    ))

    # --- module_quiz_questions: add the new shape ---
    bind.execute(sa.text("ALTER TABLE module_quiz_questions ADD COLUMN type questiontype NOT NULL DEFAULT 'MCQ'"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions ADD COLUMN image_key VARCHAR(500)"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions ADD COLUMN options_json JSONB NOT NULL DEFAULT '[]'"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions ADD COLUMN correct_option_id VARCHAR(50)"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions ADD COLUMN accepted_answers VARCHAR[] NOT NULL DEFAULT '{}'"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions ALTER COLUMN text DROP NOT NULL"))

    # --- data migration: old options[]/correct_index -> options_json/correct_option_id ---
    rows = bind.execute(sa.text("SELECT id, options, correct_index FROM module_quiz_questions")).fetchall()
    for row_id, options, correct_index in rows:
        options_json = [{"id": str(i), "text": opt, "image_key": None} for i, opt in enumerate(options or [])]
        correct_option_id = str(correct_index) if correct_index is not None else None
        bind.execute(
            sa.text("UPDATE module_quiz_questions SET options_json = :opts, correct_option_id = :cid WHERE id = :id"),
            {"opts": json.dumps(options_json), "cid": correct_option_id, "id": row_id},
        )

    bind.execute(sa.text("ALTER TABLE module_quiz_questions DROP COLUMN options"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions DROP COLUMN correct_index"))

    # --- question_banks / bank_questions ---
    bind.execute(sa.text("""
        CREATE TABLE question_banks (
            id UUID PRIMARY KEY,
            org_id UUID NOT NULL REFERENCES orgs(id),
            name VARCHAR(200) NOT NULL,
            description TEXT,
            created_at TIMESTAMPTZ DEFAULT now()
        )
    """))
    bind.execute(sa.text("CREATE INDEX ix_question_banks_org_id ON question_banks (org_id)"))

    bind.execute(sa.text("""
        CREATE TABLE bank_questions (
            id UUID PRIMARY KEY,
            bank_id UUID NOT NULL REFERENCES question_banks(id),
            position INTEGER DEFAULT 0,
            type questiontype NOT NULL DEFAULT 'MCQ',
            text TEXT,
            image_key VARCHAR(500),
            options_json JSONB NOT NULL DEFAULT '[]',
            correct_option_id VARCHAR(50),
            accepted_answers VARCHAR[] NOT NULL DEFAULT '{}'
        )
    """))
    bind.execute(sa.text("CREATE INDEX ix_bank_questions_bank_id ON bank_questions (bank_id)"))


def downgrade() -> None:
    bind = op.get_bind()

    bind.execute(sa.text("DROP TABLE bank_questions"))
    bind.execute(sa.text("DROP TABLE question_banks"))

    bind.execute(sa.text("ALTER TABLE module_quiz_questions ADD COLUMN options VARCHAR[]"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions ADD COLUMN correct_index INTEGER"))

    rows = bind.execute(sa.text("SELECT id, options_json, correct_option_id FROM module_quiz_questions")).fetchall()
    for row_id, options_json, correct_option_id in rows:
        options = [o.get("text") or "" for o in (options_json or [])]
        correct_index = None
        for i, o in enumerate(options_json or []):
            if o.get("id") == correct_option_id:
                correct_index = i
                break
        bind.execute(
            sa.text("UPDATE module_quiz_questions SET options = :opts, correct_index = :ci WHERE id = :id"),
            {"opts": options, "ci": correct_index, "id": row_id},
        )

    bind.execute(sa.text("ALTER TABLE module_quiz_questions ALTER COLUMN options SET NOT NULL"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions ALTER COLUMN correct_index SET NOT NULL"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions ALTER COLUMN text SET NOT NULL"))

    bind.execute(sa.text("ALTER TABLE module_quiz_questions DROP COLUMN accepted_answers"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions DROP COLUMN correct_option_id"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions DROP COLUMN options_json"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions DROP COLUMN image_key"))
    bind.execute(sa.text("ALTER TABLE module_quiz_questions DROP COLUMN type"))

    bind.execute(sa.text("DROP TYPE questiontype"))

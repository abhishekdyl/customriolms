"""
Parses the Aiken question format into QuestionIn objects for bulk import
into a question bank (see question_bank_service.import_aiken and
api/v1/question_banks.py's /import-aiken endpoint).

Standard Aiken is MCQ-only: a question line, then option lines like
"A) some text", then "ANSWER: A". This reader extends that same plain-text
shape to cover every question type this app supports, so one file format
and one sample covers all of them:

  - exactly two options whose text is literally "True"/"False" (either
    case, either order) is read as a True/False question rather than a
    two-option MCQ — no separate syntax needed.
  - a block with NO option lines at all — just the question text and an
    "ANSWER:" line — is read as a short-answer question, with the ANSWER
    line as the accepted answer. Multiple acceptable answers are
    separated by "/", e.g. "ANSWER: Paris/paris/France".

Blocks are separated by one or more blank lines. parse_aiken() either
returns every question (nothing partial) or raises AikenParseError with
every block's problem listed together, 1-indexed line numbers into the
original file — the same "validate the whole file before writing
anything" rule bulk_invite_from_csv uses for the same reason: a learner
shouldn't end up with half a question bank because row 9 of 40 had a
typo the admin hasn't seen yet.
"""
import re

from pydantic import ValidationError

from app.models.module import QuestionType
from app.schemas.question import OptionIn, QuestionIn

_OPTION_RE = re.compile(r"^\s*([A-Za-z])[.\)]\s*(.+?)\s*$")
_ANSWER_RE = re.compile(r"^\s*ANSWER\s*:\s*(.+?)\s*$", re.IGNORECASE)


class AikenParseError(ValueError):
    """Every block's problem already joined into one multi-line message —
    see parse_aiken."""


def _parse_block(lines: list[str], start_line: int) -> QuestionIn:
    # Everything up to the first option/ANSWER line is the question text
    # (almost always one line, but a question that wraps onto a second
    # line before the options start is joined with a space rather than
    # rejected).
    structural_start = len(lines)
    for i, line in enumerate(lines):
        if _OPTION_RE.match(line) or _ANSWER_RE.match(line):
            structural_start = i
            break

    question_text = " ".join(lines[:structural_start]).strip()
    rest = lines[structural_start:]

    options: list[tuple[str, str]] = []
    answer_raw: str | None = None
    for offset, line in enumerate(rest):
        m_ans = _ANSWER_RE.match(line)
        if m_ans:
            answer_raw = m_ans.group(1).strip()
            continue
        m_opt = _OPTION_RE.match(line)
        if m_opt:
            options.append((m_opt.group(1).upper(), m_opt.group(2).strip()))
            continue
        raise ValueError(f'line {start_line + structural_start + offset}: couldn\'t read "{line}" as an option or an ANSWER: line')

    if not question_text:
        raise ValueError(f"line {start_line}: this question is missing its text")
    if answer_raw is None:
        raise ValueError(f"line {start_line}: missing an ANSWER: line")

    if options:
        letters = [letter for letter, _ in options]
        if len(set(letters)) != len(letters):
            raise ValueError(f"line {start_line}: duplicate option letters ({', '.join(letters)})")
        match = next((letter for letter, _ in options if letter == answer_raw.upper()), None)
        if match is None:
            raise ValueError(
                f'line {start_line}: ANSWER "{answer_raw}" doesn\'t match any of this question\'s '
                f"option letters ({', '.join(sorted(set(letters)))})"
            )
        texts_lower = {text.lower() for _, text in options}
        qtype = QuestionType.TRUE_FALSE if len(options) == 2 and texts_lower == {"true", "false"} else QuestionType.MCQ
        return QuestionIn(
            type=qtype, text=question_text,
            options=[OptionIn(id=letter, text=text) for letter, text in options],
            correct_option_id=match,
        )

    accepted = [a.strip() for a in answer_raw.split("/") if a.strip()]
    if not accepted:
        raise ValueError(f"line {start_line}: the ANSWER: line has no accepted-answer text")
    return QuestionIn(type=QuestionType.SHORT_ANSWER, text=question_text, accepted_answers=accepted)


def parse_aiken(text: str) -> list[QuestionIn]:
    lines = text.splitlines()
    blocks: list[tuple[int, list[str]]] = []
    current: list[str] = []
    current_start = 1
    for i, raw_line in enumerate(lines, start=1):
        line = raw_line.rstrip()
        if line.strip() == "":
            if current:
                blocks.append((current_start, current))
                current = []
            continue
        if not current:
            current_start = i
        current.append(line)
    if current:
        blocks.append((current_start, current))

    if not blocks:
        raise AikenParseError("That file doesn't contain any questions")

    questions: list[QuestionIn] = []
    errors: list[str] = []
    for start_line, block_lines in blocks:
        try:
            questions.append(_parse_block(block_lines, start_line))
        except ValidationError as e:
            errors.append(f"line {start_line}: " + "; ".join(err["msg"] for err in e.errors()))
        except ValueError as e:
            errors.append(str(e))

    if errors:
        raise AikenParseError("Couldn't import this file:\n" + "\n".join(errors))

    return questions

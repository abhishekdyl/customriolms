"""
Parses the Aiken question format into questions for bulk import into a
question bank (see question_bank_service.import_aiken and
api/v1/question_banks.py's /import-aiken endpoint).

Standard Aiken is MCQ-only: a question line, then option lines like
"A) some text", then "ANSWER: A". This reader extends that same plain-text
shape to cover every question type and content this app supports, so one
format and one sample covers all of them:

  - exactly two options whose text is literally "True"/"False" (either
    case, either order) is read as a True/False question rather than a
    two-option MCQ — no separate syntax needed.
  - a block with NO option lines at all — just the question text and an
    "ANSWER:" line — is read as a short-answer question, with the ANSWER
    line's text as the accepted answer. Multiple acceptable answers are
    separated by "/", e.g. "ANSWER: Paris/paris, France"
  - a question or an option can carry a picture instead of, or alongside,
    text via an "IMAGE: <filename>" marker — "IMAGE: elephant.png" on its
    own line right after the question text attaches a picture to the
    question itself (optionally alongside question text on the lines
    before it); "A) IMAGE: nike.png" makes that option a picture with no
    text of its own, and "A) Nike swoosh IMAGE: nike.png" gives that same
    option BOTH text and a picture — IMAGE: is read as a trailing marker
    on the option line, so anything before it on that line is kept as the
    option's text. The filename is resolved against whatever other files
    were uploaded alongside the .txt in a .zip (see import_aiken_file) —
    this module only ever sees filenames, never image bytes, so parsing
    never needs a database or storage backend.

Blocks are separated by one or more blank lines. parse_aiken() either
returns every question (nothing partial) or raises AikenParseError with
every block's problem listed together (1-indexed line numbers into the
original file) — nothing is written until the whole file parses cleanly,
same "validate everything before writing anything" rule
bulk_invite_from_csv uses for the same reason.
"""
import re
from dataclasses import dataclass, field

from pydantic import ValidationError

from app.models.module import QuestionType
from app.schemas.question import OptionIn, QuestionIn

_OPTION_RE = re.compile(r"^\s*([A-Za-z])[.\)]\s*(.+?)\s*$")
_ANSWER_RE = re.compile(r"^\s*ANSWER\s*:\s*(.+?)\s*$", re.IGNORECASE)
_IMAGE_RE = re.compile(r"^\s*IMAGE\s*:\s*(.+?)\s*$", re.IGNORECASE)
# Matches an option's value whether it's text-only, picture-only, or both:
# an IMAGE: marker is read as a trailing piece of the line, so whatever sits
# before it (possibly nothing) is the option's text and whatever sits after
# the colon is the filename. Anchored to the end of the line so a filename
# can't accidentally swallow IMAGE: again if that word appeared earlier.
_OPTION_IMAGE_RE = re.compile(r"^(.*?)\bIMAGE\s*:\s*(.+?)\s*$", re.IGNORECASE)


class AikenParseError(ValueError):
    """Every block's problem already joined into one multi-line message —
    see parse_aiken."""


@dataclass
class ParsedOption:
    id: str
    text: str | None
    image_ref: str | None  # a filename from an "IMAGE:" line, not yet uploaded/resolved


@dataclass
class ParsedQuestion:
    start_line: int
    type: QuestionType
    text: str | None
    image_ref: str | None
    options: list[ParsedOption] = field(default_factory=list)
    correct_option_id: str | None = None
    accepted_answers: list[str] = field(default_factory=list)

    def image_refs(self) -> set[str]:
        """Every filename this question's text/options reference via
        IMAGE: — what import_aiken_file needs to find inside the zip and
        upload before this can become a real QuestionIn."""
        refs = {self.image_ref} if self.image_ref else set()
        refs |= {o.image_ref for o in self.options if o.image_ref}
        return refs

    def resolve(self, image_keys: dict[str, str]) -> QuestionIn:
        """Swaps each IMAGE: filename reference for the real image_key
        storage_service gave it after uploading. Only call this once
        every filename this question refers to is confirmed present in
        image_keys (keyed by filename.lower()) — import_aiken_file checks
        that for the whole file before resolving any question."""
        def resolved(ref: str | None) -> str | None:
            return image_keys[ref.lower()] if ref else None

        return QuestionIn(
            type=self.type, text=self.text, image_key=resolved(self.image_ref),
            options=[OptionIn(id=o.id, text=o.text, image_key=resolved(o.image_ref)) for o in self.options],
            correct_option_id=self.correct_option_id, accepted_answers=self.accepted_answers,
        )


def required_image_refs(questions: list[ParsedQuestion]) -> set[str]:
    refs: set[str] = set()
    for q in questions:
        refs |= q.image_refs()
    return refs


def _parse_block(lines: list[str], start_line: int) -> ParsedQuestion:
    # Everything up to the first option/ANSWER line is either the
    # question's text or its IMAGE: line (almost always one text line,
    # but a question that wraps onto a second line before the options
    # start is joined with a space rather than rejected).
    structural_start = len(lines)
    for i, line in enumerate(lines):
        if _OPTION_RE.match(line) or _ANSWER_RE.match(line):
            structural_start = i
            break

    pre_lines: list[str] = []
    question_image_ref: str | None = None
    for line in lines[:structural_start]:
        m_img = _IMAGE_RE.match(line)
        if m_img:
            question_image_ref = m_img.group(1).strip()
        else:
            pre_lines.append(line)
    question_text = " ".join(pre_lines).strip() or None

    rest = lines[structural_start:]
    options: list[ParsedOption] = []
    answer_raw: str | None = None
    for offset, line in enumerate(rest):
        m_ans = _ANSWER_RE.match(line)
        if m_ans:
            answer_raw = m_ans.group(1).strip()
            continue
        m_opt = _OPTION_RE.match(line)
        if m_opt:
            letter = m_opt.group(1).upper()
            value = m_opt.group(2).strip()
            m_img = _OPTION_IMAGE_RE.match(value)
            if m_img:
                option_text = m_img.group(1).strip() or None
                options.append(ParsedOption(id=letter, text=option_text, image_ref=m_img.group(2).strip()))
            else:
                options.append(ParsedOption(id=letter, text=value, image_ref=None))
            continue
        raise ValueError(f'line {start_line + structural_start + offset}: couldn\'t read "{line}" as an option or an ANSWER: line')

    if not question_text and not question_image_ref:
        raise ValueError(f"line {start_line}: this question has no text and no IMAGE: line either")
    if answer_raw is None:
        raise ValueError(f"line {start_line}: missing an ANSWER: line")

    if options:
        letters = [o.id for o in options]
        if len(set(letters)) != len(letters):
            raise ValueError(f"line {start_line}: duplicate option letters ({', '.join(letters)})")
        match = next((o.id for o in options if o.id == answer_raw.upper()), None)
        if match is None:
            raise ValueError(
                f'line {start_line}: ANSWER "{answer_raw}" doesn\'t match any of this question\'s '
                f"option letters ({', '.join(sorted(set(letters)))})"
            )
        texts_lower = {(o.text or "").lower() for o in options if o.text}
        qtype = QuestionType.TRUE_FALSE if len(options) == 2 and texts_lower == {"true", "false"} else QuestionType.MCQ
        parsed = ParsedQuestion(
            start_line=start_line, type=qtype, text=question_text, image_ref=question_image_ref,
            options=options, correct_option_id=match,
        )
    else:
        accepted = [a.strip() for a in answer_raw.split("/") if a.strip()]
        if not accepted:
            raise ValueError(f"line {start_line}: the ANSWER: line has no accepted-answer text")
        parsed = ParsedQuestion(
            start_line=start_line, type=QuestionType.SHORT_ANSWER, text=question_text, image_ref=question_image_ref,
            accepted_answers=accepted,
        )

    # Validate the shape (option counts, True/False exactly 2, duplicate
    # ids, etc.) by building a throwaway QuestionIn with a placeholder
    # image_key wherever an IMAGE: reference was found — the real
    # image_key isn't known yet (nothing's been uploaded at parse time),
    # but every other rule QuestionIn enforces applies the same way
    # whether or not a question has pictures, so this still catches a
    # structurally broken question up front.
    try:
        QuestionIn(
            type=parsed.type, text=parsed.text, image_key="pending" if parsed.image_ref else None,
            options=[OptionIn(id=o.id, text=o.text, image_key="pending" if o.image_ref else None) for o in parsed.options],
            correct_option_id=parsed.correct_option_id, accepted_answers=parsed.accepted_answers,
        )
    except ValidationError as e:
        raise ValueError(f"line {start_line}: " + "; ".join(err["msg"] for err in e.errors())) from e

    return parsed


def parse_aiken(text: str) -> list[ParsedQuestion]:
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

    questions: list[ParsedQuestion] = []
    errors: list[str] = []
    for start_line, block_lines in blocks:
        try:
            questions.append(_parse_block(block_lines, start_line))
        except ValueError as e:
            errors.append(str(e))

    if errors:
        raise AikenParseError("Couldn't import this file:\n" + "\n".join(errors))

    return questions

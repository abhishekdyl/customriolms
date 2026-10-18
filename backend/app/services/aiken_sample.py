"""
Builds the downloadable demo .zip for the Aiken bulk-question importer
(see api/v1/question_banks.py's GET /aiken-sample.zip and aiken_parser.py
for the format itself). One .txt covering every question type/shape the
importer reads — plain MCQ, True/False, short-answer with one accepted
answer and with several, a question whose own picture is attached via
IMAGE:, and a question whose OPTIONS are pictures — plus placeholder
images for the picture questions, referenced by filename exactly the way
a real upload would reference the admin's own pictures. The images are
just solid-color placeholders with a label, the same idea as the CSV
bulk-invite template's example row: something to open and understand at
a glance, then overwrite with the real thing.
"""
import io
import zipfile

from PIL import Image, ImageDraw

SAMPLE_TXT = """What is the capital of France?
A) Paris
B) London
C) Berlin
D) Madrid
ANSWER: A

The Great Wall of China is visible from space with the naked eye.
A) True
B) False
ANSWER: B

Name the largest planet in our solar system.
ANSWER: Jupiter

What is 2 + 2?
ANSWER: 4/four

What animal is shown in this picture?
IMAGE: animal.png
A) Elephant
B) Giraffe
C) Lion
ANSWER: A

Which picture shows a circle?
A) IMAGE: shape_a.png
B) IMAGE: shape_b.png
ANSWER: A
"""


def _placeholder_image(label: str, color: tuple[int, int, int]) -> bytes:
    img = Image.new("RGB", (320, 200), color=color)
    draw = ImageDraw.Draw(img)
    draw.text((16, 90), label, fill="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


def build_aiken_sample_zip() -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("questions.txt", SAMPLE_TXT)
        zf.writestr("animal.png", _placeholder_image("SAMPLE: ELEPHANT", (88, 130, 92)))
        zf.writestr("shape_a.png", _placeholder_image("SAMPLE: CIRCLE", (70, 100, 170)))
        zf.writestr("shape_b.png", _placeholder_image("SAMPLE: SQUARE", (170, 92, 70)))
    return buf.getvalue()

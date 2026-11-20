"""Generates the downloadable PDF invoice for a paid transaction — an
org's own subscription payment (billing.py) or a learner's paid course
enrolment (courses.py). One shared renderer so both invoice types look
and read the same way; callers just supply the line items and who paid
whom.
"""
import io
from datetime import datetime

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet


def rupees(paise: int, currency: str = "INR") -> str:
    symbol = "₹" if currency == "INR" else f"{currency} "
    return f"{symbol}{paise / 100:,.2f}"


def render_invoice_pdf(
    *,
    invoice_no: str,
    issued_at: datetime,
    status: str,
    seller_name: str,
    seller_detail: str | None,
    buyer_name: str,
    buyer_detail: str | None,
    description: str,
    amount: int,  # paise
    currency: str,
    razorpay_payment_id: str | None,
) -> bytes:
    """Returns the finished PDF as bytes — callers stream it straight
    back, nothing is written to disk."""
    styles = getSampleStyleSheet()
    title_style = ParagraphStyle("InvoiceTitle", parent=styles["Title"], fontSize=20, spaceAfter=2)
    label_style = ParagraphStyle("Label", parent=styles["Normal"], fontSize=9, textColor=colors.HexColor("#6b7280"))
    value_style = ParagraphStyle("Value", parent=styles["Normal"], fontSize=11, spaceAfter=6)

    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
    )
    elements = []

    elements.append(Paragraph("INVOICE", title_style))
    elements.append(Paragraph(f"#{invoice_no}", label_style))
    elements.append(Spacer(1, 10 * mm))

    meta_rows = [
        ["Issued", issued_at.strftime("%d %b %Y, %H:%M UTC")],
        ["Status", status.upper()],
    ]
    if razorpay_payment_id:
        meta_rows.append(["Payment ref", razorpay_payment_id])
    meta_table = Table(meta_rows, colWidths=[35 * mm, 120 * mm])
    meta_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("TEXTCOLOR", (0, 0), (0, -1), colors.HexColor("#6b7280")),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ]))
    elements.append(meta_table)
    elements.append(Spacer(1, 10 * mm))

    parties = Table(
        [
            [Paragraph("Billed by", label_style), Paragraph("Billed to", label_style)],
            [
                Paragraph(f"<b>{seller_name}</b><br/>{seller_detail or ''}", value_style),
                Paragraph(f"<b>{buyer_name}</b><br/>{buyer_detail or ''}", value_style),
            ],
        ],
        colWidths=[77.5 * mm, 77.5 * mm],
    )
    elements.append(parties)
    elements.append(Spacer(1, 10 * mm))

    line_items = Table(
        [["Description", "Amount"], [description, rupees(amount, currency)]],
        colWidths=[120 * mm, 35 * mm],
    )
    line_items.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 10),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("LINEBELOW", (0, 0), (-1, 0), 0.75, colors.HexColor("#111827")),
        ("LINEBELOW", (0, -1), (-1, -1), 0.5, colors.HexColor("#e5e7eb")),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    elements.append(line_items)
    elements.append(Spacer(1, 4 * mm))

    total_table = Table([["Total", rupees(amount, currency)]], colWidths=[120 * mm, 35 * mm])
    total_table.setStyle(TableStyle([
        ("FONTSIZE", (0, 0), (-1, -1), 12),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica-Bold"),
        ("ALIGN", (1, 0), (1, -1), "RIGHT"),
    ]))
    elements.append(total_table)
    elements.append(Spacer(1, 16 * mm))
    elements.append(Paragraph("This is a system-generated invoice.", label_style))

    doc.build(elements)
    return buf.getvalue()

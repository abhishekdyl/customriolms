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
    seller_gstin: str | None = None,
    buyer_gstin: str | None = None,
    hsn_sac_code: str | None = None,
    gst_rate_percent: int | None = None,  # None/0 => no tax section at all
    same_state: bool = False,  # True => CGST+SGST split; False => IGST
) -> bytes:
    """Returns the finished PDF as bytes — callers stream it straight
    back, nothing is written to disk.

    `amount` is always treated as the tax-inclusive total actually
    charged. When gst_rate_percent is set, it's reverse-split here into
    a taxable value + tax line(s) purely for display — nothing about
    what was actually charged changes, so this can be turned on/off or
    have its rate changed later without touching any stored payment
    amount."""
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

    seller_block = f"<b>{seller_name}</b><br/>{seller_detail or ''}"
    if seller_gstin:
        seller_block += f"<br/>GSTIN: {seller_gstin}"
    buyer_block = f"<b>{buyer_name}</b><br/>{buyer_detail or ''}"
    if buyer_gstin:
        buyer_block += f"<br/>GSTIN: {buyer_gstin}"

    parties = Table(
        [
            [Paragraph("Billed by", label_style), Paragraph("Billed to", label_style)],
            [Paragraph(seller_block, value_style), Paragraph(buyer_block, value_style)],
        ],
        colWidths=[77.5 * mm, 77.5 * mm],
    )
    elements.append(parties)
    elements.append(Spacer(1, 10 * mm))

    has_gst = bool(gst_rate_percent)
    item_description = f"{description} (HSN/SAC {hsn_sac_code})" if has_gst and hsn_sac_code else description

    if has_gst:
        # `amount` is the tax-inclusive total actually charged — reverse
        # -split into taxable value + tax purely for display.
        taxable_value = round(amount / (1 + gst_rate_percent / 100))
        tax_total = amount - taxable_value
        rows = [["Description", "Amount"], [item_description, rupees(taxable_value, currency)]]
        if same_state:
            half = gst_rate_percent / 2
            rows.append([f"CGST @ {half:g}%", rupees(tax_total // 2, currency)])
            rows.append([f"SGST @ {half:g}%", rupees(tax_total - tax_total // 2, currency)])
        else:
            rows.append([f"IGST @ {gst_rate_percent:g}%", rupees(tax_total, currency)])
    else:
        rows = [["Description", "Amount"], [item_description, rupees(amount, currency)]]

    line_items = Table(rows, colWidths=[120 * mm, 35 * mm])
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
    if has_gst:
        elements.append(Paragraph("Tax is shown for information only; amount charged did not change based on this split.", label_style))
    elements.append(Paragraph("This is a system-generated invoice.", label_style))

    doc.build(elements)
    return buf.getvalue()

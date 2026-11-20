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
    base_amount: int,  # paise — the plan/course price itself, before anything added on top
    total_amount: int,  # paise — what was actually charged = base_amount + gst_amount + gateway_fee_amount
    currency: str,
    razorpay_payment_id: str | None,
    gst_amount: int = 0,  # 0 => GST line reads "—" (not charged on this payment)
    gateway_fee_amount: int = 0,  # 0 => gateway-fee line reads "—" (not charged on this payment)
    seller_gstin: str | None = None,
    buyer_gstin: str | None = None,
    hsn_sac_code: str | None = None,
    same_state: bool = False,  # only matters when gst_amount > 0: True => CGST+SGST split; False => IGST
) -> bytes:
    """Returns the finished PDF as bytes — callers stream it straight
    back, nothing is written to disk.

    GST and the gateway fee are ADDED ON TOP of base_amount, never
    deducted from it — base_amount + gst_amount + gateway_fee_amount
    must equal total_amount. The rate shown next to each is derived from
    the amounts themselves (gst_amount / base_amount), not from
    whatever PlatformSettings' rate happens to be today, so an invoice
    for a payment made under an old rate keeps showing that old rate
    forever, even after a Super Admin changes it."""
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

    item_description = f"{description} (HSN/SAC {hsn_sac_code})" if gst_amount and hsn_sac_code else description
    rows = [["Description", "Amount"], [item_description, rupees(base_amount, currency)]]

    if gst_amount > 0:
        gst_rate = round(gst_amount / base_amount * 100, 2) if base_amount else 0
        if same_state:
            half_rate, half_amount = gst_rate / 2, gst_amount // 2
            rows.append([f"CGST @ {half_rate:g}%", rupees(half_amount, currency)])
            rows.append([f"SGST @ {half_rate:g}%", rupees(gst_amount - half_amount, currency)])
        else:
            rows.append([f"IGST @ {gst_rate:g}%", rupees(gst_amount, currency)])
    else:
        rows.append(["GST", "—"])

    if gateway_fee_amount > 0:
        fee_rate = round(gateway_fee_amount / base_amount * 100, 2) if base_amount else 0
        rows.append([f"Gateway fee @ {fee_rate:g}%", rupees(gateway_fee_amount, currency)])
    else:
        rows.append(["Gateway fee", "—"])

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

    total_table = Table([["Total", rupees(total_amount, currency)]], colWidths=[120 * mm, 35 * mm])
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

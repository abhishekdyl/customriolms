import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.org import OrgPlan


class OrgPaymentStatus(str, enum.Enum):
    CREATED = "created"  # Razorpay order created, checkout not completed yet
    PAID = "paid"
    FAILED = "failed"


class OrgPayment(Base):
    """One row per checkout attempt from billing.py — created the moment
    POST /billing/checkout mints a Razorpay order, then moved to PAID or
    FAILED by whichever of /billing/verify (the client-side redirect
    callback) or /billing/webhook/razorpay (the authoritative async
    fallback — see billing.py's docstring for why both exist) hears about
    it first; the other is a no-op once a row is already decided. Never
    edited beyond that status flip — this is the license's paper trail,
    same spirit as AuditLog. Powers the Pilots tab's payment-history
    column and is what activate_license (the Super Admin manual-override
    path) deliberately does NOT write a row to, so "no payment row" vs "a
    payment row" tells you whether an org's license came from Razorpay or
    from a Super Admin override.
    """
    __tablename__ = "org_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)

    plan: Mapped[OrgPlan] = mapped_column(Enum(OrgPlan, name="orgplan"), nullable=False)
    # Paise (smallest INR unit), matching PlatformSettings.price_*_monthly
    # and Razorpay's own `amount` convention — see that model's docstring.
    # `amount` is always the TOTAL actually charged (and what's sent to
    # Razorpay as the order amount) = base_amount + gst_amount +
    # gateway_fee_amount. The three are broken out and locked in at
    # checkout time (billing.py's create_checkout, from whatever
    # PlatformSettings.gst_enabled/gateway_fee_enabled/*_percent said at
    # that moment) so a later rate change, or GST/the fee being turned
    # on or off, never rewrites what an already-issued invoice shows.
    # gst_amount/gateway_fee_amount are 0 whenever that charge wasn't
    # enabled for this particular payment (including every payment made
    # before this breakdown existed at all — see the migration backfill).
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    base_amount: Mapped[int] = mapped_column(Integer, nullable=False)
    gst_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    gateway_fee_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="INR", nullable=False)

    razorpay_order_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(200), nullable=True)

    status: Mapped[OrgPaymentStatus] = mapped_column(
        Enum(OrgPaymentStatus, name="orgpaymentstatus"), default=OrgPaymentStatus.CREATED, nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

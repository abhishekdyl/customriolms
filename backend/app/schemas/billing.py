import uuid
from datetime import datetime

from pydantic import BaseModel

from app.models.org import OrgPlan
from app.models.org_payment import OrgPaymentStatus


class OrgPaymentOut(BaseModel):
    """One row of an org's billing history, for the Super Admin's
    Organizations detail view — see org_payment.py's docstring on why
    this table exists and what "no rows at all" tells you (the org was
    never through self-checkout; either it's still on its original trial
    or a Super Admin activated it manually)."""
    id: uuid.UUID
    plan: OrgPlan
    amount: int  # paise — the TOTAL charged (base + gst + gateway fee)
    base_amount: int
    gst_amount: int
    gateway_fee_amount: int
    currency: str
    razorpay_order_id: str
    razorpay_payment_id: str | None = None
    status: OrgPaymentStatus
    created_at: datetime
    paid_at: datetime | None = None

    class Config:
        from_attributes = True


class PlanPrice(BaseModel):
    plan: OrgPlan
    monthly_price: int  # paise — the plan's own base price, see PlatformSettings.price_*_monthly
    # Breakdown computed from PlatformSettings' CURRENT gst/gateway-fee
    # toggle+rate at the moment this was requested — purely informational
    # (so the upgrade screen never surprises someone with a bigger charge
    # than shown), not locked to anything. gst_amount/gateway_fee_amount
    # are 0 whenever that charge is currently disabled.
    gst_amount: int
    gateway_fee_amount: int
    total_amount: int  # monthly_price + gst_amount + gateway_fee_amount — what checkout actually charges right now
    user_limit: int  # PLAN_USER_LIMITS — shown alongside price on the upgrade screen


class PricingOut(BaseModel):
    """GET /billing/pricing — public (no auth needed): the trial-ended
    upgrade screen needs this before the suspended org's token is even
    useful for anything else, and the registration page can use it too to
    advertise the trial length. Only plans with a non-zero price are
    listed — see PlatformSettings.price_*_monthly's docstring on 0 meaning
    "not self-checkout-sellable"."""
    trial_days: int
    razorpay_key_id: str | None  # None = Razorpay isn't configured yet; frontend hides the Pay button
    plans: list[PlanPrice]


class CheckoutRequest(BaseModel):
    plan: OrgPlan


class CheckoutOut(BaseModel):
    """What the frontend hands straight to Razorpay's Checkout widget —
    `amount` is the TOTAL Razorpay will actually charge. base_amount/
    gst_amount/gateway_fee_amount are the same breakdown that gets
    locked into the resulting OrgPayment row, included here purely so
    the frontend can show it before the Checkout modal opens."""
    razorpay_order_id: str
    razorpay_key_id: str
    amount: int  # paise — total
    base_amount: int
    gst_amount: int
    gateway_fee_amount: int
    currency: str
    plan: OrgPlan


class VerifyPaymentRequest(BaseModel):
    """The three fields Razorpay Checkout's success callback hands the
    frontend — see billing.py's verify_payment for how the signature is
    checked server-side before any of this is trusted."""
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class VerifyPaymentOut(BaseModel):
    activated: bool
    plan: OrgPlan

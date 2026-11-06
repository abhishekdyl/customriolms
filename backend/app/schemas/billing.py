from pydantic import BaseModel

from app.models.org import OrgPlan


class PlanPrice(BaseModel):
    plan: OrgPlan
    monthly_price: int  # paise — see PlatformSettings.price_*_monthly
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
    """What the frontend hands straight to Razorpay's Checkout widget."""
    razorpay_order_id: str
    razorpay_key_id: str
    amount: int  # paise
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

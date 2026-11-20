import logging
from datetime import datetime, timezone

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from razorpay.errors import SignatureVerificationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user_allow_trial_suspended
from app.core.database import get_db
from app.models.org import PLAN_USER_LIMITS, Org, OrgStatus
from app.models.org_payment import OrgPayment, OrgPaymentStatus
from app.models.platform_settings import SINGLETON_ID, PlatformSettings
from app.models.user import RoleName, User
from app.schemas.billing import CheckoutOut, CheckoutRequest, PlanPrice, PricingOut, VerifyPaymentOut, VerifyPaymentRequest

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/billing", tags=["billing"])

_PRICE_FIELD = {
    "starter": "price_starter_monthly",
    "growth": "price_growth_monthly",
    "enterprise": "price_enterprise_monthly",
}


async def _get_settings(db: AsyncSession) -> PlatformSettings:
    row = (await db.execute(select(PlatformSettings).where(PlatformSettings.id == SINGLETON_ID))).scalar_one_or_none()
    if row is None:
        row = PlatformSettings(id=SINGLETON_ID)
        db.add(row)
        await db.commit()
        await db.refresh(row)
    return row


def _razorpay_client(settings_row: PlatformSettings) -> razorpay.Client:
    if not settings_row.razorpay_key_id or not settings_row.razorpay_key_secret:
        raise HTTPException(status_code=503, detail="Online payment isn't configured yet. Contact your Riosmart representative.")
    return razorpay.Client(auth=(settings_row.razorpay_key_id, settings_row.razorpay_key_secret))


async def _require_org_admin(user: User = Depends(get_current_user_allow_trial_suspended)) -> User:
    """Billing's own gate, deliberately NOT require_capability (that
    depends on plain get_current_user, which 403s a trial_expired org
    outright — exactly the user who needs to reach these endpoints). Only
    an Org Admin manages their org's billing; Team Lead/Learner never do,
    trial-expired or not."""
    if user.role != RoleName.ORG_ADMIN:
        raise HTTPException(status_code=403, detail="Only an Org Admin can manage billing for this organization.")
    return user


@router.get("/pricing", response_model=PricingOut)
async def get_pricing(db: AsyncSession = Depends(get_db)):
    """Public, unauthenticated — same reasoning as orgs.py's
    platform-status: the trial-ended upgrade screen needs this before a
    suspended org's token is good for much else, and a visitor on the
    registration page can use it to advertise the trial length. Only
    plans with a non-zero configured price are listed (see
    PlatformSettings.price_*_monthly's docstring)."""
    settings_row = await _get_settings(db)
    plans = [
        PlanPrice(plan=plan, monthly_price=getattr(settings_row, field), user_limit=PLAN_USER_LIMITS[plan])
        for plan, field in _PRICE_FIELD.items()
        if getattr(settings_row, field) > 0
    ]
    return PricingOut(trial_days=settings_row.trial_days, razorpay_key_id=settings_row.razorpay_key_id, plans=plans)


@router.post("/checkout", response_model=CheckoutOut)
async def create_checkout(
    body: CheckoutRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_org_admin),
):
    """Mints a Razorpay order for the calling Org Admin's own org and a
    matching OrgPayment row (status=created) — the frontend hands the
    order straight to Razorpay's Checkout widget. Nothing about the org
    changes yet; that only happens once /billing/verify or the webhook
    confirms a real payment (see those docstrings)."""
    settings_row = await _get_settings(db)
    price = getattr(settings_row, _PRICE_FIELD[body.plan.value])
    if price <= 0:
        raise HTTPException(status_code=400, detail=f"The {body.plan.value} plan isn't available for self-checkout.")

    client = _razorpay_client(settings_row)
    try:
        order = client.order.create({"amount": price, "currency": "INR", "payment_capture": 1})
    except Exception:
        logger.exception("Razorpay order creation failed for org %s", current_user.org_id)
        raise HTTPException(status_code=502, detail="Couldn't reach the payment gateway. Try again in a moment.")

    payment = OrgPayment(
        org_id=current_user.org_id,
        plan=body.plan,
        amount=price,
        currency="INR",
        razorpay_order_id=order["id"],
        status=OrgPaymentStatus.CREATED,
    )
    db.add(payment)
    await db.commit()

    return CheckoutOut(
        razorpay_order_id=order["id"], razorpay_key_id=settings_row.razorpay_key_id, amount=price, currency="INR", plan=body.plan
    )


async def _activate_from_payment(db: AsyncSession, payment: OrgPayment) -> None:
    """Shared by /verify and the webhook — whichever hears about a
    successful payment first does this; the other finds status already
    PAID and no-ops (see both callers).

    Leaves trial_ends_at untouched on purpose — same reasoning as
    orgs.py's activate_license: it's how the Pilots tab finds this org at
    all, and a past trial_ends_at on an ACTIVE org is harmless since the
    lazy expiry-check only ever fires while status is still TRIAL."""
    org = (await db.execute(select(Org).where(Org.id == payment.org_id))).scalar_one()
    org.status = OrgStatus.ACTIVE
    org.plan = payment.plan
    org.user_limit = PLAN_USER_LIMITS[payment.plan]
    org.suspension_reason = None
    payment.status = OrgPaymentStatus.PAID
    payment.paid_at = datetime.now(timezone.utc)
    await db.commit()


@router.post("/verify", response_model=VerifyPaymentOut)
async def verify_payment(
    body: VerifyPaymentRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(_require_org_admin),
):
    """The fast path: Razorpay Checkout's success callback hands the
    frontend these three fields, which land here for signature
    verification before anything is trusted. This is what gives the
    paying admin an instant "you're active" response — the webhook below
    is the slower, authoritative backup for when this call never happens
    (tab closed mid-payment, a flaky connection) rather than the primary
    path."""
    payment = (
        await db.execute(select(OrgPayment).where(OrgPayment.razorpay_order_id == body.razorpay_order_id))
    ).scalar_one_or_none()
    if payment is None or payment.org_id != current_user.org_id:
        raise HTTPException(status_code=404, detail="No matching checkout found for this order.")
    if payment.status == OrgPaymentStatus.PAID:
        return VerifyPaymentOut(activated=True, plan=payment.plan)  # webhook (or an earlier call) already handled it

    settings_row = await _get_settings(db)
    client = _razorpay_client(settings_row)
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": body.razorpay_order_id,
            "razorpay_payment_id": body.razorpay_payment_id,
            "razorpay_signature": body.razorpay_signature,
        })
    except SignatureVerificationError:
        payment.status = OrgPaymentStatus.FAILED
        await db.commit()
        raise HTTPException(status_code=400, detail="Payment verification failed. If money was deducted, contact support.")

    payment.razorpay_payment_id = body.razorpay_payment_id
    payment.razorpay_signature = body.razorpay_signature
    await _activate_from_payment(db, payment)
    return VerifyPaymentOut(activated=True, plan=payment.plan)


@router.post("/webhook/razorpay", include_in_schema=False)
async def razorpay_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """The authoritative fallback /verify above's docstring mentions —
    configured as this org's webhook URL in the Razorpay dashboard, so it
    fires independently of whether the paying admin's browser ever called
    /verify. No user auth here (Razorpay calls this directly); trust comes
    entirely from the signature check against razorpay_webhook_secret, not
    from a session/token. Only acts on 'payment.captured'; every other
    event type is acknowledged and ignored. NOTE: this needs a public
    HTTPS URL to actually receive events — unreachable from a plain
    localhost dev setup, so it's only exercised for real once deployed."""
    settings_row = await _get_settings(db)
    if not settings_row.razorpay_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook isn't configured.")

    body_bytes = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    try:
        razorpay.Utility().verify_webhook_signature(body_bytes.decode(), signature, settings_row.razorpay_webhook_secret)
    except SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    payload = await request.json()
    event = payload.get("event")
    if event != "payment.captured":
        return {"ok": True}  # acknowledged, nothing to do

    order_id = payload["payload"]["payment"]["entity"]["order_id"]
    payment_id = payload["payload"]["payment"]["entity"]["id"]
    payment = (await db.execute(select(OrgPayment).where(OrgPayment.razorpay_order_id == order_id))).scalar_one_or_none()
    if payment is None:
        logger.warning("Razorpay webhook for unknown order_id %s", order_id)
        return {"ok": True}
    if payment.status != OrgPaymentStatus.PAID:
        payment.razorpay_payment_id = payment_id
        await _activate_from_payment(db, payment)
    return {"ok": True}

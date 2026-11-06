import uuid

from sqlalchemy import Boolean, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base

SINGLETON_ID = uuid.UUID("00000000-0000-0000-0000-000000000001")


class PlatformSettings(Base):
    """
    Exactly one row ever exists (id is a fixed constant — see
    SINGLETON_ID). Platform-wide switches that aren't tied to any one
    org live here, e.g. whether the public /register form is open at
    all. Super-admin only.
    """
    __tablename__ = "platform_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=lambda: SINGLETON_ID)
    allow_self_serve_signup: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    # Locks every non-Super-Admin out of the API (see deps._validate_token)
    # and shows them a maintenance page instead — Super Admin can keep
    # working (and log in) the whole time. Site-wide, not per-org.
    maintenance_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Moodle-style developer debug mode: while on, an unhandled server
    # error returns its real exception detail instead of a generic
    # message (see main.py's exception handler), and the frontend shows
    # it — plus any failed request — in a banner above the page header.
    # Meant to be switched on briefly while chasing an issue, not left on.
    debug_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # --- Licensing (billing.py, orgs.py's Pilots endpoints) ---
    # How long a self-registered org's free trial lasts before deps.py's
    # lazy check auto-suspends it (reason="trial_expired"). Only affects
    # orgs created through /auth/register; Super Admin creating an org
    # from the Organizations page starts it ACTIVE with no trial at all.
    trial_days: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    # Monthly price per plan, in paise (smallest INR unit — same
    # convention Razorpay itself uses for `amount`) so there's never a
    # float-rounding question. 0 = that plan isn't sold via self-checkout
    # (still assignable manually from Organizations/Pilots).
    price_starter_monthly: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_growth_monthly: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    price_enterprise_monthly: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Razorpay credentials. key_id is public (the frontend checkout widget
    # needs it) and is returned by GET /billing/pricing; key_secret is
    # used only server-side (order creation, signature/webhook
    # verification) and must never appear in any response — see
    # PlatformSettingsOut vs the admin-only schema in schemas/org.py.
    razorpay_key_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_key_secret: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Razorpay's webhook signing secret (separate from the API key
    # secret above — set when you add the webhook URL in the Razorpay
    # dashboard). Verifies POST /billing/webhook/razorpay really came
    # from Razorpay before trusting it to activate an org.
    razorpay_webhook_secret: Mapped[str | None] = mapped_column(String(200), nullable=True)

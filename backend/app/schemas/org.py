import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.models.org import OrgPlan, OrgStatus
from app.schemas.profile_field import ProfileFieldOut
from app.services import storage_service


class OrgLookupOut(BaseModel):
    """What the public user-registration form gets back after a visitor
    types an org's slug/code — just enough to show "You're joining
    <name>" and, if this org's admin has defined any custom profile
    fields (see profile_field_service), which of them are required —
    before the visitor fills in the rest. Nothing else about the org
    (plan, seats, admin, domains) is exposed here."""
    name: str
    slug: str
    profile_fields: list[ProfileFieldOut] = []

    class Config:
        from_attributes = True


class OrgOut(BaseModel):
    id: uuid.UUID
    name: str
    slug: str
    plan: OrgPlan
    status: OrgStatus
    user_limit: int
    allowed_domains: list[str] = []
    created_at: datetime
    industry: str | None = None
    timezone: str = "UTC"
    contact_email: str | None = None
    logo_url: str | None = None
    # Not sent to the client (exclude=True) — same presigned-on-read
    # pattern as CourseOut.cover_image_key/cover_image_url: the storage
    # key is what's permanent, logo_url below is rebuilt fresh from it
    # on every read by _resolve_logo_url.
    logo_key: str | None = Field(default=None, exclude=True)
    allow_custom_username: bool = False
    # Leaderboard point defaults — see Org model's docstring. A specific
    # course/module can override these via PointRule; see the
    # /api/v1/point-rules endpoints.
    default_module_points: int = 10
    default_course_points: int = 50
    default_perfect_quiz_points: int = 20
    user_count: int = 0  # filled in by the endpoint, not stored on the row
    # This org's (first) Org Admin — filled in by the endpoint, not stored
    # on the row. See list_orgs' docstring for why "first" rather than
    # "the" admin. admin_id is what OrgAdminUpdateRequest below targets.
    admin_id: uuid.UUID | None = None
    admin_name: str | None = None
    admin_email: str | None = None
    # Licensing (see models/org.py) — null for an org Super Admin created
    # directly (no trial at all). The Pilots page and the trial-ended
    # upgrade screen both derive their "N days left" / "expired" display
    # from trial_ends_at client-side, rather than this schema precomputing
    # it, so it stays accurate to the second without another round trip.
    trial_ends_at: datetime | None = None
    suspension_reason: str | None = None
    # This org's own Razorpay account (for paid course enrolment) — see
    # Org model's docstring on these three. Same never-round-trip-the-
    # secret convention as PlatformSettingsOut below: key_id is plain
    # (Razorpay Checkout needs it client-side anyway), the two secrets
    # only ever come back as "is one set", computed by the endpoint.
    razorpay_key_id: str | None = None
    razorpay_key_secret_set: bool = False
    razorpay_webhook_secret_set: bool = False
    # This org's own GST/billing details — real columns, so these DO
    # round-trip plainly (unlike the Razorpay secrets above).
    gstin: str | None = None
    billing_address: str | None = None
    city: str | None = None
    pincode: str | None = None
    country: str | None = None
    billing_state: str | None = None
    # This org's own Live Classes provider credentials — same
    # never-round-trip-the-secret convention as the Razorpay fields
    # above. See Org model's docstring.
    bbb_server_url: str | None = None
    bbb_shared_secret_set: bool = False
    zoom_account_id: str | None = None
    zoom_client_id: str | None = None
    zoom_client_secret_set: bool = False

    class Config:
        from_attributes = True

    @model_validator(mode="after")
    def _resolve_logo_url(self):
        if self.logo_key:
            self.logo_url = storage_service.presigned_get_url(self.logo_key)
        return self


class OrgCreateRequest(BaseModel):
    """
    Super admin creating a new customer org from the platform side —
    distinct from POST /auth/register, which is a customer signing
    themselves up. This one also creates that org's first Org Admin.
    """
    org_name: str = Field(min_length=2, max_length=200)
    plan: OrgPlan = OrgPlan.STARTER
    admin_name: str = Field(min_length=1, max_length=200)
    admin_email: EmailStr
    admin_password: str = Field(min_length=8)


class OrgUpdateStatusRequest(BaseModel):
    status: OrgStatus


class OrgUpdateRequest(BaseModel):
    """Edit an existing org's own details — separate from status, which
    has its own endpoint (and its own side effect of kicking every active
    session) and shouldn't be silently changeable via a generic PATCH."""
    name: str | None = Field(default=None, min_length=2, max_length=200)
    plan: OrgPlan | None = None
    user_limit: int | None = Field(default=None, ge=1)
    allowed_domains: list[str] | None = None


class OrgAdminUpdateRequest(BaseModel):
    """Super Admin editing this org's (first) Org Admin from the
    Organizations page — a customer's own Org Admin can't reach their own
    account through /users/{id}/profile (self-edit is blocked there) and
    a Super Admin can't reach it either (that endpoint only looks within
    the caller's own org, which for platform staff is the internal
    platform org, not this customer's). This is that missing path,
    scoped to exactly one target: whichever user GET /orgs resolved as
    this org's admin_id. Every field is optional and left alone when
    omitted; password resets must_change_password so the admin is forced
    to pick their own on next login, same as a fresh invite."""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    password: str | None = Field(default=None, min_length=8)


class OrgProfileUpdateRequest(BaseModel):
    """The Org Settings page's own self-service edit — an Org Admin's org,
    not the platform's. Deliberately a different, smaller field set than
    OrgUpdateRequest above: no plan, user_limit, or allowed_domains here —
    those stay Super-Admin-only, changed from the Organizations page, not
    from inside the org itself."""
    name: str | None = Field(default=None, min_length=2, max_length=200)
    slug: str | None = Field(default=None, min_length=2, max_length=100, pattern=r"^[a-z0-9-]+$")
    industry: str | None = None
    timezone: str | None = None
    contact_email: EmailStr | None = None
    allow_custom_username: bool | None = None
    default_module_points: int | None = Field(default=None, ge=0, le=100_000)
    default_course_points: int | None = Field(default=None, ge=0, le=100_000)
    default_perfect_quiz_points: int | None = Field(default=None, ge=0, le=100_000)
    # This org's own Razorpay account — see Org model's docstring. None
    # (omitted) leaves the existing value alone, same convention as
    # PlatformSettingsUpdateRequest's own razorpay_* fields; there's no
    # separate "clear" signal, since an Org Admin clearing it just means
    # pasting in blank values, which the frontend sends as "".
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    razorpay_webhook_secret: str | None = None
    # This org's own GST/billing details — "Billed to" on its own
    # subscription invoice (billing.py's get_my_org_payment_invoice). See
    # Org model's docstring; all optional, same no-separate-clear-signal
    # convention as the Razorpay fields just above.
    gstin: str | None = None
    billing_address: str | None = None
    city: str | None = None
    pincode: str | None = None
    country: str | None = None
    billing_state: str | None = None
    # This org's own Live Classes provider credentials — None (omitted)
    # leaves the existing value alone, same convention as the Razorpay
    # fields above.
    bbb_server_url: str | None = None
    bbb_shared_secret: str | None = None
    zoom_account_id: str | None = None
    zoom_client_id: str | None = None
    zoom_client_secret: str | None = None


class PlatformSettingsOut(BaseModel):
    allow_self_serve_signup: bool
    maintenance_mode: bool
    debug_mode: bool
    trial_days: int
    price_starter_monthly: int
    price_growth_monthly: int
    price_enterprise_monthly: int
    razorpay_key_id: str | None = None
    # Seller details for the subscription GST invoice — see
    # PlatformSettings model's docstring. None/unconfigured still
    # produces an invoice, just without a GSTIN/tax line.
    company_legal_name: str | None = None
    company_address: str | None = None
    company_city: str | None = None
    company_pincode: str | None = None
    company_gstin: str | None = None
    company_state: str | None = None
    # Shown on the Platform Settings page as a plain contact line —
    # nothing else reads this yet.
    support_email: str | None = None
    # Whether GST/a gateway-fee surcharge are actually added at checkout
    # right now — see PlatformSettings.gst_enabled's docstring. Both
    # default OFF, so a plan's monthly_price IS the total charged until
    # a Super Admin turns one of these on.
    gst_enabled: bool = False
    gst_rate_percent: int = 18
    gateway_fee_enabled: bool = False
    gateway_fee_percent: float = 0.0
    hsn_sac_code: str = "998316"
    # None = not configured yet, i.e. "show every country" — see the
    # model column's docstring. Never empty-list-as-sentinel: an empty
    # list here would mean "Super Admin picked zero countries", which
    # the update endpoint also treats as "clear back to unrestricted"
    # rather than actually storing [].
    allowed_countries: list[str] | None = None
    # Secrets themselves never round-trip back to the browser — only
    # whether one is currently set, same spirit as an SMTP password field
    # that shows a filled/empty dot rather than the value. Computed by the
    # endpoint from the row, not stored as its own column.
    razorpay_key_secret_set: bool = False
    razorpay_webhook_secret_set: bool = False

    class Config:
        from_attributes = True


class PlatformSettingsUpdateRequest(BaseModel):
    # All optional and merged server-side (only a field that's actually
    # present gets written) — each tab's save only touches its own
    # field(s), so one doesn't clobber whatever another tab last set.
    allow_self_serve_signup: bool | None = None
    maintenance_mode: bool | None = None
    debug_mode: bool | None = None
    trial_days: int | None = Field(default=None, ge=1)
    price_starter_monthly: int | None = Field(default=None, ge=0)
    price_growth_monthly: int | None = Field(default=None, ge=0)
    price_enterprise_monthly: int | None = Field(default=None, ge=0)
    razorpay_key_id: str | None = None
    razorpay_key_secret: str | None = None
    razorpay_webhook_secret: str | None = None
    # None is left alone (no key present in the PATCH body); [] is how
    # the frontend asks to clear the restriction back to "show every
    # country" — see update_platform_settings.
    allowed_countries: list[str] | None = None
    company_legal_name: str | None = None
    company_address: str | None = None
    company_city: str | None = None
    company_pincode: str | None = None
    company_gstin: str | None = None
    company_state: str | None = None
    support_email: str | None = None
    gst_enabled: bool | None = None
    gst_rate_percent: int | None = Field(default=None, ge=0, le=100)
    gateway_fee_enabled: bool | None = None
    gateway_fee_percent: float | None = Field(default=None, ge=0, le=100)
    hsn_sac_code: str | None = None


class PlatformStatusOut(BaseModel):
    """What app/main.py's public, unauthenticated /platform-status
    exposes — just enough for the frontend to decide whether to show the
    maintenance page / debug bar before anyone has even logged in, plus
    the Country dropdown's options for the public registration form.
    Deliberately a SEPARATE, narrower schema from PlatformSettingsOut:
    this endpoint has no auth at all, so nothing else on that row
    (allow_self_serve_signup, say) belongs in it."""
    maintenance_mode: bool
    debug_mode: bool
    countries: list[str] = []


class ActivateLicenseRequest(BaseModel):
    """Super Admin's manual override on the Pilots tab — activates a
    trial/expired org without a Razorpay payment. See orgs.py's
    activate_license; deliberately writes no OrgPayment row, which is how
    the Pilots tab tells "Super Admin activated this" apart from "this org
    paid via Razorpay"."""
    plan: OrgPlan = OrgPlan.STARTER
    user_limit: int | None = Field(default=None, ge=1)


class SuperAdminOut(BaseModel):
    id: uuid.UUID
    full_name: str
    email: str

    class Config:
        from_attributes = True

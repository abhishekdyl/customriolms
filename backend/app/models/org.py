import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import ARRAY, DateTime, Enum, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class OrgPlan(str, enum.Enum):
    # Not purchasable, not shown on the pricing/checkout screen — this is
    # what every self-registered org's plan reads as while it's on its
    # free trial (see auth.py's register/google_register), so the
    # Organizations and Subscriptions pages can show "which orgs are on
    # the free tier" at a glance instead of everyone showing STARTER. A
    # Super Admin can also set it by hand on an org created directly
    # (e.g. a permanent partner/nonprofit account).
    FREE = "free"
    STARTER = "starter"
    GROWTH = "growth"
    ENTERPRISE = "enterprise"


class OrgStatus(str, enum.Enum):
    ACTIVE = "active"
    TRIAL = "trial"
    SUSPENDED = "suspended"


PLAN_USER_LIMITS = {OrgPlan.FREE: 10, OrgPlan.STARTER: 20, OrgPlan.GROWTH: 100, OrgPlan.ENTERPRISE: 500}

# Default storage quota per plan, in MB — same per-plan-default-but-
# editable-per-org shape as PLAN_USER_LIMITS/user_limit above (see
# Org.storage_limit_mb). Used by usage_monitoring_service to compute
# "X GB of Y GB used" per org and flag orgs over the warning threshold.
PLAN_STORAGE_LIMITS_MB = {
    OrgPlan.FREE: 1024,        # 1 GB
    OrgPlan.STARTER: 5120,     # 5 GB
    OrgPlan.GROWTH: 20480,     # 20 GB
    OrgPlan.ENTERPRISE: 102400,  # 100 GB
}


class Org(Base):
    __tablename__ = "orgs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    plan: Mapped[OrgPlan] = mapped_column(Enum(OrgPlan, name="orgplan"), default=OrgPlan.STARTER, nullable=False)
    status: Mapped[OrgStatus] = mapped_column(Enum(OrgStatus, name="orgstatus"), default=OrgStatus.TRIAL, nullable=False)
    user_limit: Mapped[int] = mapped_column(Integer, default=20, nullable=False)
    # Same shape as user_limit above: seeded from PLAN_STORAGE_LIMITS_MB
    # at creation, editable afterward by a Super Admin independent of
    # plan (e.g. a one-off extra allowance for a specific org), read by
    # usage_monitoring_service to compute "X GB of Y GB used".
    storage_limit_mb: Mapped[int] = mapped_column(Integer, default=5120, nullable=False)
    # Self-serve signup starts every org on a clock: trial_ends_at is set
    # once at creation (now + PlatformSettings.trial_days) and never
    # moved again, even past a license activation (billing.py's
    # verify_payment / orgs.py's activate_license both leave it exactly
    # as it was — see their docstrings). A lazy check in deps.py/auth.py
    # flips status to SUSPENDED the moment anyone touches an expired
    # trial — no scheduler needed. An org Super Admin created directly
    # (orgs.py's create_org) has no trial at all: trial_ends_at stays
    # None and status starts ACTIVE there, not TRIAL. This is also how
    # the Subscriptions page (formerly "Pilots") finds every org that
    # ever came through self-serve registration, whatever its plan or
    # status is now. Note this is a one-time activation, not a recurring
    # subscription: there's no separate "current billing period" column,
    # so a licensed org's own OrgPayment rows (paid_at) are the source of
    # truth for "when they actually paid", not this frozen trial date.
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    # Set alongside status=SUSPENDED so the frontend can tell "trial ran
    # out, show the upgrade screen" (login still works, see deps.py) apart
    # from "Super Admin suspended this org" (login blocked outright,
    # unchanged). None for an org that was never suspended, or that was
    # reactivated (cleared on both manual un-suspend and on license
    # activation).
    suspension_reason: Mapped[str | None] = mapped_column(String(30), nullable=True)
    # Empty = any email domain can join/be invited. Non-empty = invites,
    # bulk-CSV rows, and the public QR/link join flow all reject any email
    # whose domain isn't in this list. Enforced in invite_service, not here.
    allowed_domains: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # Org profile — edited by the org's own Org Admin on the Org Settings
    # page, distinct from plan/status/user_limit above which only the
    # platform's Super Admin can touch (via orgs.py's super-admin-only
    # endpoints). All nullable/defaulted so existing orgs don't need
    # backfilling.
    industry: Mapped[str | None] = mapped_column(String(100), nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="UTC", nullable=False)
    contact_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # logo_url is legacy/unused — nothing writes to it any more (the
    # upload button used to be unwired). A real upload now goes through
    # POST /orgs/me/logo, storage_service's usual content-addressed
    # store, keyed here; OrgOut computes logo_url fresh from this key on
    # every read (same presigned-on-read pattern as a course's cover
    # image — see CourseOut._resolve_cover_image_url), so logo_url is
    # never read from the column directly once this is set.
    logo_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    logo_key: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # Off by default: every user's username mirrors their email and login
    # only ever happens by email. Once an Org Admin flips this on, users
    # may set their own custom username from their profile (see
    # auth.update_me) and log in with it afterward — auth.login matches
    # against username OR email either way, so existing email-based
    # logins keep working regardless of this setting.
    allow_custom_username: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Leaderboard point defaults — also edited from Org Settings (the
    # Recognition page's Leaderboard tab, "Points settings"). Applied to
    # every module completion / course completion (= certificate issued)
    # / perfect quiz attempt in this org, UNLESS a PointRule row exists
    # overriding that specific course or module (see point_rule.py and
    # learn_service.points_by_user). Defaults match what used to be
    # hardcoded, global constants (POINTS_PER_MODULE/COURSE/PERFECT_QUIZ)
    # before this became per-org configurable.
    default_module_points: Mapped[int] = mapped_column(Integer, default=10, nullable=False)
    default_course_points: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    default_perfect_quiz_points: Mapped[int] = mapped_column(Integer, default=20, nullable=False)

    # This org's OWN Razorpay account — also edited from Org Settings,
    # same self-service section as everything else above. Deliberately
    # separate from PlatformSettings.razorpay_* (the Super Admin's own
    # account, used only for org-subscription billing — see billing.py):
    # a course's paid enrolment (api/v1/courses.py's enrol/checkout) is
    # the ORG selling to its own learners, so that money has to land in
    # the org's own account, not the platform's. None/unconfigured means
    # an Org Admin simply can't turn paid_enrol_enabled on yet (see
    # courses.py's update_course validation) — there's no silent
    # fallback to the platform's account.
    razorpay_key_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_key_secret: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Verifies POST /api/v1/courses/webhook/razorpay/{org_id} — the URL
    # the Org Admin pastes into THEIR OWN Razorpay dashboard's webhook
    # settings (shown back to them on the settings page once key_id is
    # set). Per-org because each org's webhook comes from its own
    # Razorpay account, unlike the platform's single shared webhook.
    razorpay_webhook_secret: Mapped[str | None] = mapped_column(String(200), nullable=True)

    # This org's own GST/billing details — shown as "Billed to" on its
    # subscription invoice (billing.py's get_my_org_payment_invoice).
    # All optional: plenty of orgs (individuals, unregistered small
    # businesses) have no GSTIN at all, and the invoice still renders
    # fine without one — just without that line.
    gstin: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # billing_address is the street/location line; city/pincode are
    # separate so each shows on its own on the invoice and can be
    # collected as its own field on the registration form (see
    # RegisterRequest) without the Org Admin having to re-type a whole
    # address block to fix just the city later.
    billing_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    pincode: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # Full country name, validated against ALL_COUNTRIES/allowed_countries
    # the same way the learner-join form's own country field already is.
    country: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Full state name, e.g. "Maharashtra" — see PlatformSettings.company_state's
    # docstring for how this decides CGST+SGST vs IGST on the invoice.
    billing_state: Mapped[str | None] = mapped_column(String(100), nullable=True)

    # Live Classes — this org's OWN BigBlueButton/Zoom credentials, same
    # self-service section as Razorpay above, and the same reasoning:
    # each org runs its own live classes under its own BBB server/Zoom
    # account, not a platform-shared one — see live_class_service.
    # available_providers() only offers a provider on the "Schedule a
    # live class" form once that org's own credentials here are set.
    #
    # BigBlueButton — a meeting is created lazily, on the first join
    # (see live_class_service.get_join_url), by signing the request with
    # this shared secret; nothing here is itself exposed to the browser.
    bbb_server_url: Mapped[str | None] = mapped_column(String(300), nullable=True)
    bbb_shared_secret: Mapped[str | None] = mapped_column(String(300), nullable=True)
    # Zoom — a "Server-to-Server OAuth" app's own credentials (Zoom
    # Marketplace → Build App → Server-to-Server OAuth), NOT a personal
    # Zoom login — this org's own Zoom account, the same way
    # razorpay_key_id above is this org's own Razorpay account.
    zoom_account_id: Mapped[str | None] = mapped_column(String(300), nullable=True)
    zoom_client_id: Mapped[str | None] = mapped_column(String(300), nullable=True)
    zoom_client_secret: Mapped[str | None] = mapped_column(String(300), nullable=True)

    teams: Mapped[list["Team"]] = relationship(back_populates="org")
    users: Mapped[list["User"]] = relationship(back_populates="org")

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_capability, require_role
from app.core.database import get_db
from app.core.security import hash_password
from app.core.session import revoke_all_sessions
from app.models.org import PLAN_USER_LIMITS, Org, OrgStatus
from app.models.platform_settings import SINGLETON_ID, PlatformSettings
from app.models.user import RoleName, User, split_full_name
from app.schemas.org import (
    ActivateLicenseRequest,
    OrgAdminUpdateRequest,
    OrgCreateRequest,
    OrgOut,
    OrgProfileUpdateRequest,
    OrgUpdateRequest,
    OrgUpdateStatusRequest,
    PlatformSettingsOut,
    PlatformSettingsUpdateRequest,
    PlatformStatusOut,
    SuperAdminOut,
)

router = APIRouter(prefix="/api/v1/orgs", tags=["orgs"])

# Most of this file is platform-staff-only (see super_admin_only below).
# The /me endpoints are the exception — an org's own Org Admin manages
# their org's profile there; everything else here (plan, status,
# user_limit, delete) stays Super-Admin-only, changed from the platform's
# Organizations page, not from inside the org itself.
super_admin_only = [Depends(require_role(RoleName.SUPER_ADMIN))]
org_admin_only = [Depends(require_capability("org_settings.manage"))]

# Where seed_super_admin.py parks platform staff — never a real customer,
# so it should never show up in, be suspended from, or be deletable via
# this customer-facing org list.
PLATFORM_ORG_SLUG = "riosmartech-platform"


@router.get("/me", response_model=OrgOut)
async def get_my_org(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Any authenticated user can read their own org's basics — this is
    what the Users & Access page uses for the seat-limit banner and the
    domain-restriction copy, and it's what the public join-by-QR flow
    checks against. Unlike everything else in this file, not super-admin-only:
    an Org Admin/Team Lead/Learner all belong to exactly one org and are
    allowed to see its own name/plan/seat count/allowed domains."""
    result = await db.execute(select(Org).where(Org.id == current_user.org_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")

    count_result = await db.execute(select(func.count(User.id)).where(User.org_id == org.id, User.status != "deactivated"))
    return OrgOut.model_validate({**org.__dict__, "user_count": count_result.scalar_one()})


@router.patch("/me", response_model=OrgOut, dependencies=org_admin_only)
async def update_my_org(body: OrgProfileUpdateRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The Org Settings page's Save changes — an Org Admin editing their
    own org's profile (name, slug, industry, timezone, contact email).
    Deliberately can't touch plan/user_limit/allowed_domains/status —
    those stay on the Super-Admin-only endpoints above."""
    org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()

    if body.slug is not None and body.slug != org.slug:
        clash = await db.execute(select(Org.id).where(Org.slug == body.slug, Org.id != org.id))
        if clash.scalar_one_or_none() is not None:
            raise HTTPException(status_code=409, detail=f"The slug \"{body.slug}\" is already taken")

    for field in ("name", "slug", "industry", "timezone", "contact_email", "allow_custom_username"):
        value = getattr(body, field)
        if value is not None:
            setattr(org, field, value)

    await db.commit()
    await db.refresh(org)
    count_result = await db.execute(select(func.count(User.id)).where(User.org_id == org.id, User.status != "deactivated"))
    return OrgOut.model_validate({**org.__dict__, "user_count": count_result.scalar_one()})


@router.post("/me/deactivate", response_model=OrgOut, dependencies=org_admin_only)
async def deactivate_my_org(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Org Settings page's danger-zone action. Deliberately reuses the
    exact same OrgStatus.SUSPENDED path the Super Admin's Suspend does
    (orgs.py's update_org_status) rather than inventing a second notion
    of 'paused' — same guarantee either way: reversible, no data deleted,
    every active session (including the admin doing this) ends immediately.
    Reactivating requires contacting Riosmart, same as the screen says —
    there's deliberately no self-service undo button for this."""
    org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()
    org.status = OrgStatus.SUSPENDED
    org.suspension_reason = "manual"
    await db.commit()

    member_ids = await db.execute(select(User.id).where(User.org_id == org.id))
    for (member_id,) in member_ids:
        await revoke_all_sessions(str(member_id))

    await db.refresh(org)
    count_result = await db.execute(select(func.count(User.id)).where(User.org_id == org.id, User.status != "deactivated"))
    return OrgOut.model_validate({**org.__dict__, "user_count": count_result.scalar_one()})


@router.get("", response_model=list[OrgOut], dependencies=super_admin_only)
async def list_orgs(db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Org).where(Org.slug != PLATFORM_ORG_SLUG).order_by(Org.created_at.desc())
    )
    orgs = result.scalars().all()

    counts_result = await db.execute(select(User.org_id, func.count(User.id)).group_by(User.org_id))
    counts = dict(counts_result.all())

    # One org can end up with more than one ORG_ADMIN over time (e.g. an
    # invited co-admin), so this takes the first by id rather than assuming
    # exactly one row — just needs to be a stable, deterministic pick for
    # display, not "the" canonical admin. The same resolution is reused by
    # update_org_admin below, so "the admin this page shows" and "the
    # admin editing it actually changes" always agree.
    admins_result = await db.execute(
        select(User).where(User.role == RoleName.ORG_ADMIN).order_by(User.id)
    )
    admins_by_org: dict = {}
    for admin in admins_result.scalars().all():
        admins_by_org.setdefault(admin.org_id, admin)

    return [
        OrgOut.model_validate({
            **org.__dict__, "user_count": counts.get(org.id, 0),
            "admin_id": (a := admins_by_org.get(org.id)) and a.id,
            "admin_name": a and a.full_name,
            "admin_email": a and a.email,
        })
        for org in orgs
    ]


@router.post("", response_model=OrgOut, status_code=201, dependencies=super_admin_only)
async def create_org(body: OrgCreateRequest, db: AsyncSession = Depends(get_db)):
    """Platform staff onboarding a new customer: creates the org AND its
    first Org Admin in one step (a customer never sees this endpoint —
    they'd use /auth/register instead)."""
    existing = await db.execute(select(User).where(User.email == body.admin_email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    slug = body.org_name.lower().replace(" ", "-")
    # ACTIVE, not the model's TRIAL default, and no trial_ends_at — a
    # real customer onboarded by hand here never starts a trial clock
    # (that's list_pilots above's whole basis for telling these apart
    # from self-serve signups: trial_ends_at IS NULL).
    org = Org(name=body.org_name, slug=slug, plan=body.plan, status=OrgStatus.ACTIVE, user_limit=PLAN_USER_LIMITS[body.plan])
    db.add(org)
    await db.flush()

    admin_firstname, admin_lastname = split_full_name(body.admin_name)
    admin = User(
        org_id=org.id,
        firstname=admin_firstname,
        lastname=admin_lastname,
        email=body.admin_email,
        username=body.admin_email,  # default — see Org.allow_custom_username
        hashed_password=hash_password(body.admin_password),
        role=RoleName.ORG_ADMIN,
    )
    db.add(admin)
    await db.commit()
    await db.refresh(org)

    return OrgOut.model_validate({**org.__dict__, "user_count": 1, "admin_id": admin.id, "admin_name": admin.full_name, "admin_email": admin.email})


# These three stay ABOVE the /{org_id}... routes below on purpose: FastAPI/
# Starlette matches routes in declaration order, and /{org_id} is a
# catch-all for any single path segment — placed first, it would swallow
# a request for "/platform-settings" as org_id="platform-settings" before
# this file's own platform-settings handler ever saw it. (This is exactly
# what happened before this comment existed — PATCH /platform-settings
# silently 500'd trying to parse "platform-settings" as a UUID.)
def _settings_out(row: PlatformSettings) -> PlatformSettingsOut:
    """Builds the response explicitly rather than letting from_attributes
    read the row directly — razorpay_key_secret_set/razorpay_webhook_secret_set
    are computed (is it non-empty?), never the secret values themselves."""
    return PlatformSettingsOut(
        allow_self_serve_signup=row.allow_self_serve_signup,
        maintenance_mode=row.maintenance_mode,
        debug_mode=row.debug_mode,
        trial_days=row.trial_days,
        price_starter_monthly=row.price_starter_monthly,
        price_growth_monthly=row.price_growth_monthly,
        price_enterprise_monthly=row.price_enterprise_monthly,
        razorpay_key_id=row.razorpay_key_id,
        razorpay_key_secret_set=bool(row.razorpay_key_secret),
        razorpay_webhook_secret_set=bool(row.razorpay_webhook_secret),
    )


@router.get("/platform-settings", response_model=PlatformSettingsOut, dependencies=super_admin_only)
async def get_platform_settings(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PlatformSettings).where(PlatformSettings.id == SINGLETON_ID))
    settings_row = result.scalar_one_or_none()
    if settings_row is None:
        # First time anyone opens this screen — create the one row with defaults.
        settings_row = PlatformSettings(id=SINGLETON_ID)
        db.add(settings_row)
        await db.commit()
        await db.refresh(settings_row)
    return _settings_out(settings_row)


@router.patch("/platform-settings", response_model=PlatformSettingsOut, dependencies=super_admin_only)
async def update_platform_settings(body: PlatformSettingsUpdateRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PlatformSettings).where(PlatformSettings.id == SINGLETON_ID))
    settings_row = result.scalar_one_or_none()
    if settings_row is None:
        settings_row = PlatformSettings(id=SINGLETON_ID)
        db.add(settings_row)

    if body.allow_self_serve_signup is not None:
        settings_row.allow_self_serve_signup = body.allow_self_serve_signup
    if body.maintenance_mode is not None:
        settings_row.maintenance_mode = body.maintenance_mode
    if body.debug_mode is not None:
        settings_row.debug_mode = body.debug_mode
    if body.trial_days is not None:
        settings_row.trial_days = body.trial_days
    if body.price_starter_monthly is not None:
        settings_row.price_starter_monthly = body.price_starter_monthly
    if body.price_growth_monthly is not None:
        settings_row.price_growth_monthly = body.price_growth_monthly
    if body.price_enterprise_monthly is not None:
        settings_row.price_enterprise_monthly = body.price_enterprise_monthly
    if body.razorpay_key_id is not None:
        settings_row.razorpay_key_id = body.razorpay_key_id
    if body.razorpay_key_secret is not None:
        settings_row.razorpay_key_secret = body.razorpay_key_secret
    if body.razorpay_webhook_secret is not None:
        settings_row.razorpay_webhook_secret = body.razorpay_webhook_secret
    await db.commit()
    await db.refresh(settings_row)
    return _settings_out(settings_row)


@router.get("/platform-status", response_model=PlatformStatusOut)
async def get_platform_status(db: AsyncSession = Depends(get_db)):
    """Public, unauthenticated — the frontend calls this before anyone
    has logged in (to decide whether to show the maintenance page) and
    on every page while logged in (to decide whether to show the debug
    bar). Deliberately open: a visitor who isn't logged in yet still
    needs to know the site is in maintenance, and an org_id-scoped check
    would be pointless anyway since both switches are site-wide."""
    result = await db.execute(select(PlatformSettings).where(PlatformSettings.id == SINGLETON_ID))
    settings_row = result.scalar_one_or_none()
    if settings_row is None:
        return PlatformStatusOut(maintenance_mode=False, debug_mode=False)
    return PlatformStatusOut(maintenance_mode=settings_row.maintenance_mode, debug_mode=settings_row.debug_mode)


# Also kept above the /{org_id}... routes for the same route-ordering
# reason as platform-settings/platform-status above — "/pilots" would
# otherwise be swallowed by /{org_id} as org_id="pilots".
@router.get("/pilots", response_model=list[OrgOut], dependencies=super_admin_only)
async def list_pilots(db: AsyncSession = Depends(get_db)):
    """Every org that ever started on the 15-day free trial (trial_ends_at
    IS NOT NULL) — i.e. every org born through self-serve /auth/register,
    whatever its status now (still trialing, auto-suspended once the
    trial ran out, or since licensed). An org Super Admin created directly
    from the Organizations page (create_org above) never gets a
    trial_ends_at and so never shows up here — that's deliberate, those
    are real customers onboarded by hand, not self-serve pilots. The
    Pilots tab derives each row's "N days left" / "Expired" badge from
    trial_ends_at + status client-side; see OrgOut's docstring."""
    result = await db.execute(
        select(Org).where(Org.trial_ends_at.is_not(None)).order_by(Org.created_at.desc())
    )
    orgs = result.scalars().all()

    counts_result = await db.execute(select(User.org_id, func.count(User.id)).group_by(User.org_id))
    counts = dict(counts_result.all())

    admins_result = await db.execute(select(User).where(User.role == RoleName.ORG_ADMIN).order_by(User.id))
    admins_by_org: dict = {}
    for admin in admins_result.scalars().all():
        admins_by_org.setdefault(admin.org_id, admin)

    return [
        OrgOut.model_validate({
            **org.__dict__, "user_count": counts.get(org.id, 0),
            "admin_id": (a := admins_by_org.get(org.id)) and a.id,
            "admin_name": a and a.full_name,
            "admin_email": a and a.email,
        })
        for org in orgs
    ]


@router.post("/{org_id}/activate-license", response_model=OrgOut, dependencies=super_admin_only)
async def activate_license(org_id: str, body: ActivateLicenseRequest, db: AsyncSession = Depends(get_db)):
    """The Pilots tab's manual override — activates a trial/expired org
    without a Razorpay payment (e.g. an offline/negotiated deal). Writes
    no OrgPayment row on purpose: billing.py's verify_payment and this are
    the only two ways an org ever leaves TRIAL/SUSPENDED for ACTIVE, and
    "is there a payment row for this org" is how the Pilots tab tells them
    apart afterward.

    Deliberately does NOT null out trial_ends_at: list_pilots keys off
    "trial_ends_at IS NOT NULL" to find every org that ever came through
    self-serve registration, whatever its status now — clearing it here
    would make a licensed pilot vanish from its own Pilots tab instead of
    showing up as "Licensed". This is safe because deps.py's lazy
    expiry-check only ever acts on an org whose status is still TRIAL; a
    stale, past trial_ends_at on an ACTIVE org is simply inert history."""
    result = await db.execute(select(Org).where(Org.id == org_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")

    org.status = OrgStatus.ACTIVE
    org.plan = body.plan
    org.user_limit = body.user_limit if body.user_limit is not None else PLAN_USER_LIMITS[body.plan]
    org.suspension_reason = None
    await db.commit()
    await db.refresh(org)

    # No session-revoke needed here (unlike update_org_status's suspend
    # path) — a formerly-suspended org's members hold no live session to
    # kick; the next login just succeeds now that status isn't SUSPENDED.
    count_result = await db.execute(select(func.count(User.id)).where(User.org_id == org.id))
    return OrgOut.model_validate({**org.__dict__, "user_count": count_result.scalar_one()})


@router.patch("/{org_id}/status", response_model=OrgOut, dependencies=super_admin_only)
async def update_org_status(org_id: str, body: OrgUpdateStatusRequest, db: AsyncSession = Depends(get_db)):
    """Suspend pauses learner access without deleting any data (matches
    the confirmation copy in the product mockup) — reactivating just
    flips it back."""
    result = await db.execute(select(Org).where(Org.id == org_id))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")

    was_suspended = org.status == OrgStatus.SUSPENDED
    org.status = body.status
    # A Super Admin choosing to suspend/reactivate here is always a manual
    # action — distinct from deps.py's lazy trial-expiry auto-suspend,
    # which stamps "trial_expired" instead so the frontend shows the
    # upgrade screen rather than a generic "contact your admin" block (see
    # Org.suspension_reason's docstring). Reactivating through here leaves
    # trial_ends_at exactly as it was (same reasoning as activate_license's
    # docstring above) — a once-trial org that gets reactivated by hand
    # still shows up as "Licensed" on the Pilots tab instead of vanishing.
    if body.status == OrgStatus.SUSPENDED:
        org.suspension_reason = "manual"
    elif body.status == OrgStatus.ACTIVE:
        org.suspension_reason = None
    await db.commit()
    await db.refresh(org)

    # The status flip alone only blocks *future* requests (get_current_user
    # re-checks org status every time) — but anyone already mid-session
    # still holds a live Redis session until it naturally expires. Kill
    # those outright so "suspend" means "locked out now", not "locked out
    # the next time their token happens to need renewing".
    if org.status == OrgStatus.SUSPENDED and not was_suspended:
        member_ids = await db.execute(select(User.id).where(User.org_id == org.id))
        for (member_id,) in member_ids:
            await revoke_all_sessions(str(member_id))

    count_result = await db.execute(select(func.count(User.id)).where(User.org_id == org.id))
    return OrgOut.model_validate({**org.__dict__, "user_count": count_result.scalar_one()})


@router.patch("/{org_id}", response_model=OrgOut, dependencies=super_admin_only)
async def update_org(org_id: str, body: OrgUpdateRequest, db: AsyncSession = Depends(get_db)):
    """Edit an org's own details. Status has its own endpoint above,
    deliberately — a generic PATCH here never changes it."""
    result = await db.execute(select(Org).where(Org.id == org_id, Org.slug != PLATFORM_ORG_SLUG))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")

    if body.name is not None:
        org.name = body.name
    if body.plan is not None:
        org.plan = body.plan
        # Changing plan re-baselines the seat limit to that plan's default
        # unless the request also sends an explicit user_limit override
        # (e.g. a negotiated custom seat count) in the same call.
        if body.user_limit is None:
            org.user_limit = PLAN_USER_LIMITS[body.plan]
    if body.user_limit is not None:
        org.user_limit = body.user_limit
    if body.allowed_domains is not None:
        org.allowed_domains = [d.strip().lower() for d in body.allowed_domains if d.strip()]

    await db.commit()
    await db.refresh(org)

    count_result = await db.execute(select(func.count(User.id)).where(User.org_id == org.id))
    return OrgOut.model_validate({**org.__dict__, "user_count": count_result.scalar_one()})


@router.patch("/{org_id}/admin", response_model=OrgOut, dependencies=super_admin_only)
async def update_org_admin(org_id: str, body: OrgAdminUpdateRequest, db: AsyncSession = Depends(get_db)):
    """Super Admin editing this org's Org Admin from the Organizations
    page — see OrgAdminUpdateRequest's docstring for why this needs its
    own endpoint rather than reusing /users/{id}/profile. Targets
    whichever user list_orgs/get_my_org resolve as "the" admin (first
    ORG_ADMIN by id) — same resolution, so what's shown and what's
    edited always match."""
    org_result = await db.execute(select(Org).where(Org.id == org_id, Org.slug != PLATFORM_ORG_SLUG))
    org = org_result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")

    admin_result = await db.execute(
        select(User).where(User.org_id == org.id, User.role == RoleName.ORG_ADMIN).order_by(User.id)
    )
    admin = admin_result.scalars().first()
    if admin is None:
        raise HTTPException(status_code=404, detail="This org has no Org Admin yet")

    if body.email is not None and body.email.lower() != admin.email:
        email = body.email.lower()
        clash = await db.execute(select(User.id).where(User.email == email, User.id != admin.id))
        if clash.scalar_one_or_none():
            raise HTTPException(status_code=400, detail=f"{email} is already registered to another account")
        if admin.username == admin.email:
            admin.username = email
        admin.email = email

    if body.name is not None:
        admin.firstname, admin.lastname = split_full_name(body.name)

    if body.password is not None:
        admin.hashed_password = hash_password(body.password)
        # Same reasoning as a fresh invite's default password — the Super
        # Admin set this one on the admin's behalf, so the admin is forced
        # to replace it with something only they know before doing
        # anything else, and every session reset by it (below) can't be
        # resumed with the old password either way.
        admin.must_change_password = True
        await revoke_all_sessions(str(admin.id))

    await db.commit()
    await db.refresh(org)

    count_result = await db.execute(select(func.count(User.id)).where(User.org_id == org.id))
    return OrgOut.model_validate({
        **org.__dict__, "user_count": count_result.scalar_one(),
        "admin_id": admin.id, "admin_name": admin.full_name, "admin_email": admin.email,
    })


@router.delete("/{org_id}", status_code=204, dependencies=super_admin_only)
async def delete_org(org_id: str, db: AsyncSession = Depends(get_db)):
    """Hard-deletes an org — only when it's already empty. Courses, teams,
    and users all carry FK references to orgs.id with no cascade defined
    (deliberately: an org with real data should never disappear by
    accident), so this refuses rather than silently cascading. The
    intended path for a customer leaving is Suspend, which is reversible
    and keeps their data; Delete is for cleaning up an org that was
    created by mistake or a trial that never onboarded anyone.
    """
    result = await db.execute(select(Org).where(Org.id == org_id, Org.slug != PLATFORM_ORG_SLUG))
    org = result.scalar_one_or_none()
    if org is None:
        raise HTTPException(status_code=404, detail="Org not found")

    count_result = await db.execute(select(func.count(User.id)).where(User.org_id == org.id))
    if count_result.scalar_one() > 0:
        raise HTTPException(
            status_code=409,
            detail="This organization still has users. Remove or transfer them first, or suspend the organization instead of deleting it.",
        )

    await db.delete(org)
    await db.commit()


@router.get("/super-admins", response_model=list[SuperAdminOut], dependencies=super_admin_only)
async def list_super_admins(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.role == RoleName.SUPER_ADMIN))
    return result.scalars().all()

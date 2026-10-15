from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_role
from app.core.database import get_db
from app.core.security import hash_password
from app.core.session import revoke_all_sessions
from app.models.org import PLAN_USER_LIMITS, Org, OrgStatus
from app.models.platform_settings import SINGLETON_ID, PlatformSettings
from app.models.user import RoleName, User, split_full_name
from app.schemas.org import (
    OrgCreateRequest,
    OrgOut,
    OrgProfileUpdateRequest,
    OrgUpdateRequest,
    OrgUpdateStatusRequest,
    PlatformSettingsOut,
    PlatformSettingsUpdateRequest,
    SuperAdminOut,
)

router = APIRouter(prefix="/api/v1/orgs", tags=["orgs"])

# Most of this file is platform-staff-only (see super_admin_only below).
# The /me endpoints are the exception — an org's own Org Admin manages
# their org's profile there; everything else here (plan, status,
# user_limit, delete) stays Super-Admin-only, changed from the platform's
# Organizations page, not from inside the org itself.
super_admin_only = [Depends(require_role(RoleName.SUPER_ADMIN))]
org_admin_only = [Depends(require_role(RoleName.ORG_ADMIN))]

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
    # display, not "the" canonical admin.
    admins_result = await db.execute(
        select(User.org_id, User.email).where(User.role == RoleName.ORG_ADMIN).order_by(User.id)
    )
    admin_emails: dict = {}
    for org_id, email in admins_result.all():
        admin_emails.setdefault(org_id, email)

    return [
        OrgOut.model_validate({**org.__dict__, "user_count": counts.get(org.id, 0), "admin_email": admin_emails.get(org.id)})
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
    org = Org(name=body.org_name, slug=slug, plan=body.plan, user_limit=PLAN_USER_LIMITS[body.plan])
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

    return OrgOut.model_validate({**org.__dict__, "user_count": 1, "admin_email": admin.email})


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
    return settings_row


@router.patch("/platform-settings", response_model=PlatformSettingsOut, dependencies=super_admin_only)
async def update_platform_settings(body: PlatformSettingsUpdateRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(PlatformSettings).where(PlatformSettings.id == SINGLETON_ID))
    settings_row = result.scalar_one_or_none()
    if settings_row is None:
        settings_row = PlatformSettings(id=SINGLETON_ID)
        db.add(settings_row)

    settings_row.allow_self_serve_signup = body.allow_self_serve_signup
    await db.commit()
    await db.refresh(settings_row)
    return settings_row


@router.get("/super-admins", response_model=list[SuperAdminOut], dependencies=super_admin_only)
async def list_super_admins(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.role == RoleName.SUPER_ADMIN))
    return result.scalars().all()

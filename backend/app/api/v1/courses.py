import logging
import mimetypes
import uuid

import razorpay
from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from razorpay.errors import SignatureVerificationError
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_optional_user_via_header_or_query, require_capability
from app.core.database import get_db
from app.models.category import Category
from app.models.course import Course
from app.models.course_enrolment_payment import CourseEnrolmentPayment, CourseEnrolmentPaymentStatus
from app.models.course_rating import CourseRating
from app.models.course_announcement import CourseAnnouncement
from app.models.org import Org
from app.models.module import Module, ModuleType
from app.models.user import RoleName, User
from app.schemas.audit_log import AuditLogOut
from app.schemas.course_rating import (
    CourseRatingAdminOut, CourseRatingIn, CourseRatingModerateUpdate, CourseRatingSummary, MyCourseRatingOut,
)
from app.schemas.course_announcement import CourseAnnouncementIn, CourseAnnouncementOut, CourseAnnouncementUpdate
from app.services import course_preview_service as preview_svc
from app.services import course_rating_service as rating_svc
from app.services import course_announcement_service as announce_svc
from app.services import whatsapp_service as wa_svc
from app.schemas.course import (
    AttemptOverrideOut, AttemptOverrideSet, CalendarItemOut, CatalogCourseOut, CourseAssignRequest, CourseCreate,
    CourseDuplicateRequest, CourseEnrolCheckoutOut, CourseEnrolVerifyOut, CourseEnrolVerifyRequest,
    CourseEnrolmentPaymentOut, CourseGroupIn, CourseGroupOut, CourseGroupUpdate, CourseImportRequest,
    CourseImportResult, CourseListItem, CourseModuleProgressOut, CourseOut, CourseUpdate, DueOverrideOut,
    DueOverrideSet, EnrolledLearnerOut, GradebookOut, LearnerCourseOut, ModuleCreate, ModuleOut,
    ModuleReorderRequest, ModuleUpdate, MyCourseItem, ParticipantRoleUpdate, QuizAttemptOut, SelfEnrolOut,
)
from app.schemas.notification import BroadcastPreviewOut, BroadcastResultOut, BroadcastTargetIn
from app.schemas.learn import (
    CompleteRequest, CompleteResult, QuizResult, QuizSubmit, ScormCheckpointIn, ScormProgressOut, WatchCheckpointIn,
    WatchProgressOut,
)
from app.services.course_service import (
    _assigned_to, _validate_ids_belong_to_org, _would_create_cycle, activate_course_payment, add_module,
    assign_course, can_manage_participant_roles, create_course_group, delete_course_group, get_course_or_404,
    get_my_course, list_attempt_overrides, list_calendar, list_course_groups, list_courses, list_enrolable_courses,
    list_enrolled, list_gradebook, list_module_progress, list_my_courses, list_quiz_attempts, remove_module_content,
    reorder_modules, self_enrol, set_attempt_override, set_due_override, set_participant_role, update_course_group,
    update_module, upload_module_content, upload_scorm_package,
)
from app.services.invoice_service import compose_address, render_invoice_pdf
from app.services.course_transfer_service import duplicate_course, export_course_snapshot, import_course_snapshot
from app.services import audit_log_service
from app.services import learn_service as progress_svc
from app.services import storage_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/courses", tags=["courses"])


@router.get("", response_model=list[CourseListItem])
async def get_courses(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # A learner only ever sees what's assigned to them — not the org's whole catalogue.
    if current_user.role == RoleName.LEARNER:
        return await list_my_courses(db, current_user)
    return await list_courses(db, current_user.org_id)


# Declared before "/{course_id}" on purpose — otherwise FastAPI would try to
# parse the word "mine" as a course UUID and return a 422.
@router.get("/mine", response_model=list[MyCourseItem])
async def get_my_courses(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Courses assigned to the logged-in user (via team or directly), with their progress."""
    return await list_my_courses(db, current_user)


@router.get("/mine/{course_id}", response_model=LearnerCourseOut)
async def get_my_course_detail(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Course view for the learner it's assigned to — modules and quiz questions, no answers."""
    return await get_my_course(db, course_id, current_user)


@router.get("/catalog", response_model=list[CatalogCourseOut])
async def get_catalog(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Published courses this user isn't enrolled in yet but could self or
    paid-enrol into — the "browse" view alongside /mine's "already
    assigned" one. Declared before "/{course_id}" for the same reason
    "/mine" is (see that comment)."""
    return await list_enrolable_courses(db, current_user)


async def _get_published_course_or_404(db: AsyncSession, course_id: uuid.UUID, org_id: uuid.UUID) -> Course:
    """Same org-scoped lookup as get_course_or_404, plus the draft gate
    list_my_courses/get_my_course apply — a learner enrolling themselves
    (free or paid) must never be able to do it to a course that isn't
    live yet, even by guessing/reusing an id."""
    course = await get_course_or_404(db, course_id, org_id)
    if not course.published:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _org_razorpay_client(org: Org) -> razorpay.Client:
    """A course's paid enrolment is the ORG selling to its own learners —
    deliberately the org's OWN Razorpay account (Org.razorpay_key_id/
    secret, set from Org Settings), never the platform's
    PlatformSettings.razorpay_* (that one's only for org-subscription
    billing, see billing.py). Mirrors billing.py's _razorpay_client."""
    if not org.razorpay_key_id or not org.razorpay_key_secret:
        raise HTTPException(status_code=503, detail="This organization hasn't connected a Razorpay account yet. Contact your Org Admin.")
    return razorpay.Client(auth=(org.razorpay_key_id, org.razorpay_key_secret))


@router.post("/{course_id}/self-enrol", response_model=SelfEnrolOut)
async def self_enrol_course(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Learner enrols themselves — every restriction (country, required
    course) is re-checked server-side in course_service.self_enrol, never
    trusted from what the catalog call showed earlier."""
    course = await _get_published_course_or_404(db, course_id, current_user.org_id)
    await self_enrol(db, course, current_user)
    return SelfEnrolOut(enrolled=True)


@router.post("/{course_id}/enrol/checkout", response_model=CourseEnrolCheckoutOut)
async def create_course_enrol_checkout(
    course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Mints a Razorpay order for this learner's own paid enrolment —
    exact mirror of billing.py's create_checkout, scoped to a course
    instead of an org plan. Nothing is enrolled yet; that only happens
    once /enrol/verify or the webhook confirms a real payment."""
    course = await _get_published_course_or_404(db, course_id, current_user.org_id)
    if not course.paid_enrol_enabled or not course.paid_enrol_price:
        raise HTTPException(status_code=400, detail="Paid enrolment isn't available for this course")
    if current_user.id in (course.assigned_user_ids or []):
        raise HTTPException(status_code=400, detail="You're already enrolled in this course")

    org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()
    client = _org_razorpay_client(org)
    try:
        order = client.order.create({"amount": course.paid_enrol_price, "currency": "INR", "payment_capture": 1})
    except Exception:
        logger.exception("Razorpay order creation failed for course %s", course.id)
        raise HTTPException(status_code=502, detail="Couldn't reach the payment gateway. Try again in a moment.")

    payment = CourseEnrolmentPayment(
        org_id=current_user.org_id, course_id=course.id, user_id=current_user.id,
        amount=course.paid_enrol_price, currency="INR", razorpay_order_id=order["id"],
        status=CourseEnrolmentPaymentStatus.CREATED,
    )
    db.add(payment)
    await db.commit()
    return CourseEnrolCheckoutOut(
        razorpay_order_id=order["id"], razorpay_key_id=org.razorpay_key_id,
        amount=course.paid_enrol_price, currency="INR", course_id=course.id,
    )


@router.post("/{course_id}/enrol/verify", response_model=CourseEnrolVerifyOut)
async def verify_course_enrol_payment(
    course_id: uuid.UUID, body: CourseEnrolVerifyRequest,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """The fast path, same reasoning as billing.py's verify_payment — the
    per-org webhook below is the slower, authoritative backup for when
    this call never happens."""
    payment = (
        await db.execute(select(CourseEnrolmentPayment).where(CourseEnrolmentPayment.razorpay_order_id == body.razorpay_order_id))
    ).scalar_one_or_none()
    if payment is None or payment.course_id != course_id or payment.user_id != current_user.id:
        raise HTTPException(status_code=404, detail="No matching checkout found for this order.")
    if payment.status == CourseEnrolmentPaymentStatus.PAID:
        return CourseEnrolVerifyOut(enrolled=True)  # webhook (or an earlier call) already handled it

    org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()
    client = _org_razorpay_client(org)
    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": body.razorpay_order_id,
            "razorpay_payment_id": body.razorpay_payment_id,
            "razorpay_signature": body.razorpay_signature,
        })
    except SignatureVerificationError:
        payment.status = CourseEnrolmentPaymentStatus.FAILED
        await db.commit()
        raise HTTPException(status_code=400, detail="Payment verification failed. If money was deducted, contact support.")

    payment.razorpay_payment_id = body.razorpay_payment_id
    payment.razorpay_signature = body.razorpay_signature
    await activate_course_payment(db, payment)
    return CourseEnrolVerifyOut(enrolled=True)


@router.post("/webhook/razorpay/{org_id}", include_in_schema=False)
async def course_enrol_razorpay_webhook(org_id: uuid.UUID, request: Request, db: AsyncSession = Depends(get_db)):
    """The authoritative fallback /enrol/verify's docstring mentions —
    this exact URL (with the org's own id) is what an Org Admin pastes
    into THEIR OWN Razorpay dashboard's webhook settings (see Org
    Settings), so it fires independently of whether the paying learner's
    browser ever called /enrol/verify. No user auth (Razorpay calls this
    directly); trust comes entirely from the signature check against
    THIS org's own razorpay_webhook_secret. Only acts on
    'payment.captured'; every other event type is acknowledged and
    ignored. Exact mirror of billing.py's razorpay_webhook, scoped to one
    org's own account instead of the platform's shared one."""
    org = (await db.execute(select(Org).where(Org.id == org_id))).scalar_one_or_none()
    if org is None or not org.razorpay_webhook_secret:
        raise HTTPException(status_code=503, detail="Webhook isn't configured.")

    body_bytes = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    try:
        razorpay.Utility().verify_webhook_signature(body_bytes.decode(), signature, org.razorpay_webhook_secret)
    except SignatureVerificationError:
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    payload = await request.json()
    if payload.get("event") != "payment.captured":
        return {"ok": True}  # acknowledged, nothing to do

    order_id = payload["payload"]["payment"]["entity"]["order_id"]
    payment_id = payload["payload"]["payment"]["entity"]["id"]
    payment = (
        await db.execute(select(CourseEnrolmentPayment).where(CourseEnrolmentPayment.razorpay_order_id == order_id, CourseEnrolmentPayment.org_id == org_id))
    ).scalar_one_or_none()
    if payment is None:
        logger.warning("Course-enrolment Razorpay webhook for unknown order_id %s (org %s)", order_id, org_id)
        return {"ok": True}
    if payment.status != CourseEnrolmentPaymentStatus.PAID:
        payment.razorpay_payment_id = payment_id
        await activate_course_payment(db, payment)
    return {"ok": True}


@router.get("/enrol-payments/mine", response_model=list[CourseEnrolmentPaymentOut])
async def list_my_course_enrol_payments(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """A learner's own "Payments" page — every paid-enrolment checkout
    attempt they've made, across any course, newest first. Mirrors
    billing.py's list_my_org_payments, scoped to the caller's own
    user_id instead of an org."""
    result = await db.execute(
        select(CourseEnrolmentPayment, Course.title)
        .join(Course, Course.id == CourseEnrolmentPayment.course_id)
        .where(CourseEnrolmentPayment.user_id == current_user.id)
        .order_by(CourseEnrolmentPayment.created_at.desc())
    )
    return [
        CourseEnrolmentPaymentOut(
            id=payment.id, course_id=payment.course_id, course_title=title,
            amount=payment.amount, currency=payment.currency, razorpay_payment_id=payment.razorpay_payment_id,
            status=payment.status.value, created_at=payment.created_at, paid_at=payment.paid_at,
        )
        for payment, title in result.all()
    ]


@router.get("/enrol-payments/{payment_id}/invoice")
async def get_my_course_enrol_payment_invoice(
    payment_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Downloadable PDF for one of the learner's own paid-enrolment
    payments — only ever their own row, and only once Razorpay has
    actually confirmed the money."""
    row = (
        await db.execute(
            select(CourseEnrolmentPayment, Course.title, Org)
            .join(Course, Course.id == CourseEnrolmentPayment.course_id)
            .join(Org, Org.id == CourseEnrolmentPayment.org_id)
            .where(CourseEnrolmentPayment.id == payment_id, CourseEnrolmentPayment.user_id == current_user.id)
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Invoice not found")
    payment, course_title, org = row
    if payment.status != CourseEnrolmentPaymentStatus.PAID:
        raise HTTPException(status_code=400, detail="This payment hasn't completed yet — there's nothing to invoice.")

    # "Billed by" is the ORG (it's selling its own course, see Org
    # model's razorpay_* docstring for why this money lands in the
    # org's own account, not the platform's) — same compose_address
    # helper billing.py's subscription invoice uses, so the org's real
    # address shows here too instead of the old hardcoded
    # "Course enrolment" placeholder that was never wired to anything.
    seller_detail = compose_address(org.billing_address, org.city, org.pincode, org.country) or org.contact_email
    # "Billed to" is the learner — their own city/country (collected on
    # the "join an org" registration form, see UserRegisterRequest) if
    # they filled it in, else just the email as before.
    buyer_detail = compose_address(None, current_user.city, None, current_user.country) or current_user.email

    pdf_bytes = render_invoice_pdf(
        invoice_no=str(payment.id)[:8].upper(),
        issued_at=payment.paid_at or payment.created_at,
        status=payment.status.value,
        seller_name=org.name, seller_detail=seller_detail,
        buyer_name=f"{current_user.firstname} {current_user.lastname}".strip(), buyer_detail=buyer_detail,
        description=f"Enrolment — {course_title}",
        base_amount=payment.amount, total_amount=payment.amount, currency=payment.currency,
        razorpay_payment_id=payment.razorpay_payment_id,
        seller_gstin=org.gstin,
    )
    return Response(
        content=pdf_bytes, media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="invoice-{str(payment.id)[:8]}.pdf"'},
    )


async def _module_belongs_to_course(module_id: uuid.UUID, course_id: uuid.UUID, db: AsyncSession) -> None:
    row = (await db.execute(select(Module.id).where(Module.id == module_id, Module.course_id == course_id))).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Module not found on this course")


@router.post("/mine/{course_id}/modules/{module_id}/complete", response_model=CompleteResult)
async def complete_my_module(
    course_id: uuid.UUID, module_id: uuid.UUID, body: CompleteRequest | None = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Marks a non-quiz module done for the caller. 404s if the module isn't
    on this course, or the course isn't assigned to them (checked inside
    complete_module via assigned_courses). body.watched_pct only matters
    for a WATCH module — see complete_module's docstring."""
    await _module_belongs_to_course(module_id, course_id, db)
    pct, completed, code, video_question_results, video_earned_points, video_total_points, attempts_used, attempts_remaining, retake_allowed = (
        await progress_svc.complete_module(
            db, current_user, module_id, (body.watched_pct if body else None), (body.answers if body else None),
            (body.scorm_score if body else None), (body.scorm_passed if body else None), (body.scorm_status if body else None),
        )
    )
    return CompleteResult(progress=pct, course_completed=completed, certificate_code=code,
                           video_question_results=video_question_results,
                           video_earned_points=video_earned_points, video_total_points=video_total_points,
                           attempts_used=attempts_used, attempts_remaining=attempts_remaining, retake_allowed=retake_allowed)


@router.patch("/mine/{course_id}/modules/{module_id}/watch-progress", response_model=WatchProgressOut)
async def checkpoint_my_watch_progress(
    course_id: uuid.UUID, module_id: uuid.UUID, body: WatchCheckpointIn,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Called continuously during WATCH playback — on an interval for
    watched_pct, and immediately whenever an in-video question is
    answered — so a reload / new tab / fresh login resumes exactly where
    the learner left off. Never gated (see checkpoint_watch_progress's
    docstring); unlike /complete, this never counts as an attempt."""
    await _module_belongs_to_course(module_id, course_id, db)
    wp = await progress_svc.checkpoint_watch_progress(db, current_user, module_id, body.watched_pct, body.answer)
    return WatchProgressOut(
        furthest_pct=wp.furthest_pct, attempt_number=wp.attempt_number,
        answered_question_ids=[uuid.UUID(qid) for qid in wp.answers_json.keys()],
    )


@router.post("/mine/{course_id}/modules/{module_id}/watch-retake", response_model=WatchProgressOut)
async def retake_my_watch_module(
    course_id: uuid.UUID, module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Explicit "retake" for a WATCH module's in-video questions — same
    attempts gate as a quiz retake (module's retake_enabled/retake_limit
    plus any per-learner ModuleAttemptOverride). 403s once attempts are
    exhausted. Resets the learner's answered-question set so the next
    playthrough asks every in-video question again; the video itself was
    always freely replayable regardless."""
    await _module_belongs_to_course(module_id, course_id, db)
    wp = await progress_svc.retake_watch_module(db, current_user, module_id)
    return WatchProgressOut(furthest_pct=wp.furthest_pct, attempt_number=wp.attempt_number, answered_question_ids=[])


@router.patch("/mine/{course_id}/modules/{module_id}/scorm-progress", response_model=ScormProgressOut)
async def checkpoint_my_scorm_progress(
    course_id: uuid.UUID, module_id: uuid.UUID, body: ScormCheckpointIn,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Called every time the SCORM package's own JS calls LMSCommit/Commit
    — so a reload / new tab / fresh login resumes exactly where the
    package itself left off. Never gated; not an attempt."""
    await _module_belongs_to_course(module_id, course_id, db)
    sp = await progress_svc.checkpoint_scorm_progress(db, current_user, module_id, body.cmi)
    return ScormProgressOut(cmi=sp.cmi_data, attempt_number=sp.attempt_number)


@router.post("/mine/{course_id}/modules/{module_id}/scorm-retake", response_model=ScormProgressOut)
async def retake_my_scorm_module(
    course_id: uuid.UUID, module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Explicit "retake" for a SCORM module — same attempts gate as a quiz
    retake. 403s once attempts are exhausted. Resets the learner's saved
    CMI state so the package starts fresh next time."""
    await _module_belongs_to_course(module_id, course_id, db)
    sp = await progress_svc.retake_scorm_module(db, current_user, module_id)
    return ScormProgressOut(cmi=sp.cmi_data, attempt_number=sp.attempt_number)


@router.post("/mine/{course_id}/modules/{module_id}/quiz", response_model=QuizResult)
async def submit_my_quiz(
    course_id: uuid.UUID, module_id: uuid.UUID, body: QuizSubmit,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Scores a quiz module's answers server-side and records the attempt."""
    await _module_belongs_to_course(module_id, course_id, db)
    result = await progress_svc.submit_quiz(db, current_user, module_id, body.answers)
    return result


# ---------------------------------------------------------- Preview as learner --
# An Org Admin / course teacher walking through a course exactly like a
# real learner would (module completion, video/SCORM progress, quizzes,
# locks, certificates) — WITHOUT being enrolled. See course_preview_
# service's module docstring for why this is safe to build straight on
# top of the real learner tables. Access is capability-gated (courses.
# manage), not assignment-gated, and works on a draft course too (so it
# can be tried before publishing or assigning anyone).

@router.get("/{course_id}/preview", response_model=LearnerCourseOut)
async def get_course_preview(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    preview_svc.require_preview_access(current_user)
    return await preview_svc.get_preview_course(db, course_id, current_user)


@router.post("/{course_id}/preview/modules/{module_id}/complete", response_model=CompleteResult)
async def complete_preview_module(
    course_id: uuid.UUID, module_id: uuid.UUID, body: CompleteRequest | None = None,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    preview_svc.require_preview_access(current_user)
    await _module_belongs_to_course(module_id, course_id, db)
    pct, completed, code, video_question_results, video_earned_points, video_total_points, attempts_used, attempts_remaining, retake_allowed = (
        await preview_svc.complete_module(
            db, current_user, course_id, module_id, (body.watched_pct if body else None), (body.answers if body else None),
            (body.scorm_score if body else None), (body.scorm_passed if body else None), (body.scorm_status if body else None),
        )
    )
    return CompleteResult(progress=pct, course_completed=completed, certificate_code=code,
                           video_question_results=video_question_results,
                           video_earned_points=video_earned_points, video_total_points=video_total_points,
                           attempts_used=attempts_used, attempts_remaining=attempts_remaining, retake_allowed=retake_allowed)


@router.patch("/{course_id}/preview/modules/{module_id}/watch-progress", response_model=WatchProgressOut)
async def checkpoint_preview_watch_progress(
    course_id: uuid.UUID, module_id: uuid.UUID, body: WatchCheckpointIn,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    preview_svc.require_preview_access(current_user)
    await _module_belongs_to_course(module_id, course_id, db)
    wp = await preview_svc.checkpoint_watch_progress(db, current_user, course_id, module_id, body.watched_pct, body.answer)
    return WatchProgressOut(
        furthest_pct=wp.furthest_pct, attempt_number=wp.attempt_number,
        answered_question_ids=[uuid.UUID(qid) for qid in wp.answers_json.keys()],
    )


@router.post("/{course_id}/preview/modules/{module_id}/watch-retake", response_model=WatchProgressOut)
async def retake_preview_watch_module(
    course_id: uuid.UUID, module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    preview_svc.require_preview_access(current_user)
    await _module_belongs_to_course(module_id, course_id, db)
    wp = await preview_svc.retake_watch_module(db, current_user, course_id, module_id)
    return WatchProgressOut(furthest_pct=wp.furthest_pct, attempt_number=wp.attempt_number, answered_question_ids=[])


@router.patch("/{course_id}/preview/modules/{module_id}/scorm-progress", response_model=ScormProgressOut)
async def checkpoint_preview_scorm_progress(
    course_id: uuid.UUID, module_id: uuid.UUID, body: ScormCheckpointIn,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    preview_svc.require_preview_access(current_user)
    await _module_belongs_to_course(module_id, course_id, db)
    sp = await preview_svc.checkpoint_scorm_progress(db, current_user, course_id, module_id, body.cmi)
    return ScormProgressOut(cmi=sp.cmi_data, attempt_number=sp.attempt_number)


@router.post("/{course_id}/preview/modules/{module_id}/scorm-retake", response_model=ScormProgressOut)
async def retake_preview_scorm_module(
    course_id: uuid.UUID, module_id: uuid.UUID,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    preview_svc.require_preview_access(current_user)
    await _module_belongs_to_course(module_id, course_id, db)
    sp = await preview_svc.retake_scorm_module(db, current_user, course_id, module_id)
    return ScormProgressOut(cmi=sp.cmi_data, attempt_number=sp.attempt_number)


@router.post("/{course_id}/preview/modules/{module_id}/quiz", response_model=QuizResult)
async def submit_preview_quiz(
    course_id: uuid.UUID, module_id: uuid.UUID, body: QuizSubmit,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    preview_svc.require_preview_access(current_user)
    await _module_belongs_to_course(module_id, course_id, db)
    return await preview_svc.submit_quiz(db, current_user, course_id, module_id, body.answers)


@router.post("/{course_id}/preview/reset", status_code=204)
async def reset_course_preview(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Wipes the caller's OWN progress on this one course (their
    ModuleProgress/WatchProgress/ScormProgress/QuizAttempt rows and any
    certificate earned while previewing), so they can restart from
    module 1 — see course_preview_service.reset_preview_progress."""
    preview_svc.require_preview_access(current_user)
    await preview_svc.reset_preview_progress(db, current_user, course_id)


@router.post("", response_model=CourseOut, status_code=201, dependencies=[Depends(require_capability("courses.manage"))])
async def create_course(body: CourseCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    if body.category_id:
        cat = await db.execute(select(Category).where(Category.id == body.category_id, Category.org_id == current_user.org_id))
        if cat.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Category not found in this organization")
    if body.opens_at and body.closes_at and body.closes_at <= body.opens_at:
        raise HTTPException(status_code=400, detail="Close date must be after the open date")

    course = Course(org_id=current_user.org_id, title=body.title, category_id=body.category_id,
                     description=body.description, duration_label=body.duration_label,
                     opens_at=body.opens_at, closes_at=body.closes_at, created_by=current_user.id,
                     # The creator starts as this course's Teacher — they can
                     # add/remove others (or themselves) from the Participants
                     # list afterward; see Course.teacher_user_ids.
                     teacher_user_ids=[current_user.id])
    db.add(course)
    await db.commit()
    # Every course starts with one announcement instead of an empty
    # board — see course_announcement_service.seed_default.
    await announce_svc.seed_default(db, course, current_user.id)
    await db.commit()
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="course.created",
        entity_type="course", entity_id=course.id, entity_label=course.title,
        detail=f"Created course \"{course.title}\" (draft)", course_id=course.id,
    )
    # Not db.refresh() — see course_service.get_course_or_404's note; a
    # plain refresh() doesn't reload relationships (modules, category),
    # and this response needs both. Re-fetching through the same helper
    # every other course endpoint uses also picks up category_name.
    return await get_course_or_404(db, course.id, current_user.org_id)


@router.post("/import", response_model=CourseImportResult, status_code=201, dependencies=[Depends(require_capability("courses.manage"))])
async def import_course(body: CourseImportRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Recreates a course from a file an earlier GET /{course_id}/export
    produced — in this org, as a new draft course. See
    course_transfer_service's module docstring for exactly what is and
    isn't carried over; `warnings` in the response lists anything that
    needs the admin's attention afterward (always: files to re-upload)."""
    course, warnings = await import_course_snapshot(db, body.file, org_id=current_user.org_id, category_id=body.category_id, user=current_user)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="course.imported",
        entity_type="course", entity_id=course.id, entity_label=course.title,
        detail=f"Imported course \"{course.title}\" from a file ({len(warnings)} warning(s))", course_id=course.id,
    )
    return CourseImportResult(course=course, warnings=warnings)


@router.get("/{course_id}", response_model=CourseOut)
async def get_course(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    # The full authoring shape includes quiz answers — learners use /courses/mine/{id} instead.
    if current_user.role == RoleName.LEARNER:
        raise HTTPException(status_code=403, detail="Not allowed")
    return await get_course_or_404(db, course_id, current_user.org_id)


@router.post("/{course_id}/duplicate", response_model=CourseOut, status_code=201, dependencies=[Depends(require_capability("courses.manage"))])
async def duplicate_course_endpoint(
    course_id: uuid.UUID, body: CourseDuplicateRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Deep-copies this course into a new one in the same org — same
    modules, quiz questions, restrictions, groups, completion rules, and
    real file content, so it runs exactly like the original (see
    course_transfer_service.duplicate_course). Not copied: assignment,
    group membership, due-date overrides, learner progress. The new
    course starts as a draft."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    new_course = await duplicate_course(db, course, title=body.title, category_id=body.category_id, user=current_user)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="course.duplicated",
        entity_type="course", entity_id=new_course.id, entity_label=new_course.title,
        detail=f"Duplicated \"{course.title}\" as \"{new_course.title}\"", course_id=new_course.id,
    )
    return new_course


@router.get("/{course_id}/activity", response_model=list[AuditLogOut], dependencies=[Depends(require_capability("courses.view"))])
async def get_course_activity(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """This course's own change history — every edit to the course itself
    plus every module under it (content saves, file/SCORM replaces, quiz
    questions, restrictions, deletes), newest first. Same rows as the
    org-wide Audit Log, pre-filtered to this course (see
    audit_log_service.list_course_activity)."""
    await get_course_or_404(db, course_id, current_user.org_id)  # ownership check
    return await audit_log_service.list_course_activity(db, current_user.org_id, course_id)


@router.get("/{course_id}/export", dependencies=[Depends(require_capability("courses.manage"))])
async def export_course_endpoint(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """A downloadable JSON snapshot of this course's full configuration —
    for moving it to a different org/environment (e.g. staging) via
    POST /courses/import there. See course_transfer_service's module
    docstring for exactly what is (and isn't — file content) carried.
    Plain dict response (not CourseOut) — this is the export file
    itself, not the usual course shape."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return export_course_snapshot(course)


@router.patch("/{course_id}", response_model=CourseOut, dependencies=[Depends(require_capability("courses.manage"))])
async def update_course(course_id: uuid.UUID, body: CourseUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    data = body.model_dump(exclude_unset=True)
    # Resolve what opens_at/closes_at will actually be AFTER this patch
    # (an update may touch only one of the two) before checking the pair
    # against each other — same rule create_course enforces up front.
    resolved_opens = data.get("opens_at", course.opens_at)
    resolved_closes = data.get("closes_at", course.closes_at)
    if resolved_opens and resolved_closes and resolved_closes <= resolved_opens:
        raise HTTPException(status_code=400, detail="Close date must be after the open date")
    if "category_id" in data and data["category_id"]:
        cat = await db.execute(select(Category).where(Category.id == data["category_id"], Category.org_id == current_user.org_id))
        if cat.scalar_one_or_none() is None:
            raise HTTPException(status_code=400, detail="Category not found in this organization")
    if "completion_module_ids" in data:
        ids = data["completion_module_ids"] or []
        # completion_module_ids isn't a real FK array (see Course model's
        # note) — check every id belongs to THIS course explicitly, the
        # same way module/badge/skill ids get validated elsewhere.
        valid_ids = {m.id for m in course.modules}
        if any(i not in valid_ids for i in ids):
            raise HTTPException(status_code=400, detail="One or more of those modules aren't on this course")
        data["completion_module_ids"] = ids
    if "prerequisite_course_ids" in data:
        ids = data["prerequisite_course_ids"] or []
        if course.id in ids:
            raise HTTPException(status_code=400, detail="A course can't be its own prerequisite")
        await _validate_ids_belong_to_org(db, Course, ids, current_user.org_id, "prerequisite course")
        if ids and await _would_create_cycle(db, course.id, ids):
            raise HTTPException(status_code=400, detail="That would create a prerequisite cycle")
        data["prerequisite_course_ids"] = ids
    if "self_enrol_required_course_id" in data and data["self_enrol_required_course_id"] is not None:
        req_id = data["self_enrol_required_course_id"]
        if req_id == course.id:
            raise HTTPException(status_code=400, detail="A course can't require itself for self-enrolment")
        await _validate_ids_belong_to_org(db, Course, [req_id], current_user.org_id, "required course")
    if "self_enrol_allowed_countries" in data:
        # Dedup + trim, same light cleanup as any free-text list elsewhere
        # in this codebase — [] (the default) means no restriction.
        data["self_enrol_allowed_countries"] = sorted({c.strip() for c in (data["self_enrol_allowed_countries"] or []) if c.strip()})
    resolved_paid_enabled = data.get("paid_enrol_enabled", course.paid_enrol_enabled)
    resolved_paid_price = data.get("paid_enrol_price", course.paid_enrol_price)
    if resolved_paid_enabled and not resolved_paid_price:
        raise HTTPException(status_code=400, detail="Set a price before turning paid enrolment on")
    if resolved_paid_enabled:
        # Paid enrolment pays into the ORG's own Razorpay account (see
        # _org_razorpay_client), never the platform's — can't turn it on
        # until that account is actually connected from Org Settings.
        org = (await db.execute(select(Org).where(Org.id == current_user.org_id))).scalar_one()
        if not org.razorpay_key_id or not org.razorpay_key_secret:
            raise HTTPException(status_code=400, detail="Connect your organization's Razorpay account in Org Settings before turning paid enrolment on")
    old_published = course.published
    for key, value in data.items():
        setattr(course, key, value)
    await db.commit()
    if "published" in data and data["published"] != old_published:
        await audit_log_service.record(
            db, org_id=current_user.org_id, actor=current_user, action="course.published" if course.published else "course.unpublished",
            entity_type="course", entity_id=course.id, entity_label=course.title,
            detail=f"{'Published' if course.published else 'Unpublished'} course \"{course.title}\"", course_id=course.id,
        )
    other_changes = {k: v for k, v in data.items() if k != "published"}
    if other_changes:
        await audit_log_service.record(
            db, org_id=current_user.org_id, actor=current_user, action="course.updated",
            entity_type="course", entity_id=course.id, entity_label=course.title,
            detail=f"Updated course \"{course.title}\": {', '.join(sorted(other_changes))}", course_id=course.id,
        )
    return await get_course_or_404(db, course_id, current_user.org_id)


@router.post("/{course_id}/cover-image", response_model=CourseOut, dependencies=[Depends(require_capability("courses.manage"))])
async def upload_course_cover_image(
    course_id: uuid.UUID, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Course cover image — same dedup-ledger upload as a user avatar
    (storage_service.store_file keyed by component/filearea/itemid), so a
    re-upload replaces this course's one cover slot rather than piling up
    orphaned blobs."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    file.file.seek(0, 2)
    size = file.file.tell()
    file.file.seek(0)
    storage_service.validate_image_upload(file, size)
    record = await storage_service.store_file(
        db, file, org_id=current_user.org_id, component="course", filearea="cover",
        itemid=course.id, user=current_user,
    )
    course.cover_image_key = storage_service.file_key(record)
    await db.commit()
    return await get_course_or_404(db, course_id, current_user.org_id)


@router.delete("/{course_id}/cover-image", status_code=204, dependencies=[Depends(require_capability("courses.manage"))])
async def delete_course_cover_image(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    had_cover = bool(course.cover_image_key)
    course.cover_image_key = None
    await db.commit()
    if had_cover:
        await storage_service.delete_file_ref(db, component="course", filearea="cover", itemid=course.id)
        await db.commit()


@router.delete("/{course_id}", status_code=204, dependencies=[Depends(require_capability("courses.manage"))])
async def delete_course(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    title = course.title
    await db.delete(course)  # cascades to modules and their questions
    await db.commit()
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="course.deleted",
        entity_type="course", entity_id=course_id, entity_label=title,
        detail=f"Deleted course \"{title}\"", course_id=course_id,
    )


@router.post("/{course_id}/assign", response_model=CourseOut, dependencies=[Depends(require_capability("courses.assign"))])
async def assign(course_id: uuid.UUID, body: CourseAssignRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await assign_course(db, course, body.team_ids, body.user_ids)


@router.patch("/{course_id}/participants/{user_id}/role", status_code=204)
async def update_participant_role(
    course_id: uuid.UUID, user_id: uuid.UUID, body: ParticipantRoleUpdate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Promotes/demotes a row on the Participants list between "Teacher"
    and "Learner" — see course_service.set_participant_role. Deliberately
    no blanket capability dependency here (not even courses.assign) —
    permission is entirely can_manage_participant_roles's own call: an
    Org Admin, or any of this course's EXISTING teachers, even one who
    only holds courses.manage/courses.view and nothing else — same scope
    as course_rating_service.can_moderate."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    if not can_manage_participant_roles(course, current_user):
        raise HTTPException(status_code=403, detail="Only an Org Admin or this course's own Teacher can change participant roles")
    await _validate_ids_belong_to_org(db, User, [user_id], current_user.org_id, "user")
    await set_participant_role(db, course, user_id, body.as_role)


@router.post(
    "/{course_id}/notify-whatsapp/preview", response_model=BroadcastPreviewOut,
    dependencies=[Depends(require_capability("courses.manage"))],
)
async def preview_course_launch_notification(
    course_id: uuid.UUID, body: BroadcastTargetIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Recipient count + how many of them have no phone on file — shown
    before the admin commits to actually sending (see BroadcastPreviewOut)."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    users = await wa_svc.resolve_broadcast_targets(db, current_user.org_id, body, course)
    recipient_count, without_phone_count = wa_svc.preview_counts(users)
    return BroadcastPreviewOut(recipient_count=recipient_count, without_phone_count=without_phone_count)


@router.post(
    "/{course_id}/notify-whatsapp", response_model=BroadcastResultOut,
    dependencies=[Depends(require_capability("courses.manage"))],
)
async def send_course_launch_notification(
    course_id: uuid.UUID, body: BroadcastTargetIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """"Notify via WhatsApp" on a course — admin-triggered, not tied to
    Course.published (see this feature's own scope decision: launching
    and announcing are separate moments, so this can be fired whenever,
    more than once)."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    users = await wa_svc.resolve_broadcast_targets(db, current_user.org_id, body, course)
    sent, failed, skipped = await wa_svc.send_course_launch_notification(db, current_user.org_id, course.title, users)
    return BroadcastResultOut(sent=sent, failed=failed, skipped=skipped)


@router.get(
    "/{course_id}/enrolled", response_model=list[EnrolledLearnerOut],
    dependencies=[Depends(require_capability("courses.view"))],
)
async def get_enrolled(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Who's actually enrolled — team + individual assignment resolved into
    real learners, each with their own progress. A Team Lead only sees
    their own team's members (enforced in list_enrolled)."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await list_enrolled(db, course, current_user)


@router.get(
    "/{course_id}/module-progress", response_model=CourseModuleProgressOut,
    dependencies=[Depends(require_capability("courses.view"))],
)
async def get_module_progress(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The module-by-module completion matrix — every enrolled learner as a
    row, every module on the course as a column, so an admin can see
    exactly which modules each learner has (and hasn't) cleared, not just
    their rolled-up course %. A Team Lead only sees their own team."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await list_module_progress(db, course, current_user)


@router.get(
    "/{course_id}/gradebook", response_model=GradebookOut,
    dependencies=[Depends(require_capability("courses.view"))],
)
async def get_gradebook(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """The Moodle-style single weighted/aggregate course grade — every
    QUIZ (and grade-required SCORM) module's best score, weighted and
    averaged, plus the pass/fail cutoff (Course.pass_mark). A Team Lead
    only sees their own team's members."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await list_gradebook(db, course, current_user)


@router.get(
    "/{course_id}/quiz-attempts", response_model=list[QuizAttemptOut],
    dependencies=[Depends(require_capability("courses.view"))],
)
async def get_quiz_attempts(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every submission of every quiz module on this course, pass or fail,
    with exactly what each learner answered — a quiz always records an
    attempt whether it's right or wrong, so this is how an admin reviews
    what actually happened rather than only the pass/fail gate a learner
    sees. A Team Lead only sees their own team's members."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await list_quiz_attempts(db, course, current_user)


@router.get(
    "/{course_id}/attempt-overrides", response_model=list[AttemptOverrideOut],
    dependencies=[Depends(require_capability("courses.view"))],
)
async def get_attempt_overrides(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every learner who's been granted extra attempts (on top of their
    module's normal retake_limit) anywhere on this course — see
    ModuleAttemptOverride. A Team Lead only sees their own team."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await list_attempt_overrides(db, course, current_user)


@router.put(
    "/{course_id}/modules/{module_id}/attempt-overrides/{user_id}", response_model=AttemptOverrideOut,
    dependencies=[Depends(require_capability("courses.grade"))],
)
async def put_attempt_override(
    course_id: uuid.UUID, module_id: uuid.UUID, user_id: uuid.UUID, body: AttemptOverrideSet,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Grants (or revokes, with extra_attempts=0) one specific learner
    extra attempts on one specific quiz module — independent of, and on
    top of, that module's own retake_enabled/retake_limit setting for
    everyone else. Org Admin only, same as every other module-editing
    action."""
    await get_course_or_404(db, course_id, current_user.org_id)  # ownership check
    module = await _get_module_or_404(db, module_id, course_id)
    return await set_attempt_override(db, module, user_id, body.extra_attempts, current_user.org_id)


@router.put(
    "/{course_id}/due-override/{user_id}", response_model=DueOverrideOut | None,
    dependencies=[Depends(require_capability("courses.grade"))],
)
async def put_due_override(
    course_id: uuid.UUID, user_id: uuid.UUID, body: DueOverrideSet,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Sets (or clears, with due_at=null) one specific learner's personal
    due date on this course — independent of, and on top of, the
    course's own closes_at for everyone else. Org Admin only, same as
    every other enrollment-editing action."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await set_due_override(db, course, user_id, body.due_at)


# ---------- Groups/cohorts — course-scoped sub-groups of enrolled
# learners (see CourseGroup's docstring). Org Admin only, same reasoning
# as due-override above: groups can gate module content and set a
# group-wide due date, so they're course *configuration*, not just a
# reporting view (unlike /enrolled or /gradebook, which Team Lead can
# also read). ----------

@router.get(
    "/{course_id}/groups", response_model=list[CourseGroupOut],
    dependencies=[Depends(require_capability("courses.manage_content"))],
)
async def get_course_groups(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await list_course_groups(db, course)


@router.post(
    "/{course_id}/groups", response_model=CourseGroupOut, status_code=201,
    dependencies=[Depends(require_capability("courses.manage_content"))],
)
async def post_course_group(course_id: uuid.UUID, body: CourseGroupIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await create_course_group(db, course, body)


@router.patch(
    "/{course_id}/groups/{group_id}", response_model=CourseGroupOut,
    dependencies=[Depends(require_capability("courses.manage_content"))],
)
async def patch_course_group(
    course_id: uuid.UUID, group_id: uuid.UUID, body: CourseGroupUpdate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    return await update_course_group(db, course, group_id, body)


@router.delete(
    "/{course_id}/groups/{group_id}", status_code=204,
    dependencies=[Depends(require_capability("courses.manage_content"))],
)
async def delete_course_group_endpoint(
    course_id: uuid.UUID, group_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    await delete_course_group(db, course, group_id)


@router.get("/calendar/mine", response_model=list[CalendarItemOut])
async def get_my_calendar(db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Every course assigned to the current learner, with their own
    effective due date (their personal override if one was set, else
    the course's own closes_at) — backs the Calendar page's "what's due
    this week" view. Learner-only; an admin manages due dates from the
    course's own Participants tab instead."""
    return await list_calendar(db, current_user)


# ---------- Modules — nested under their course, not a flat /api/v1/modules,
# so every module operation is naturally org-scoped through its parent ----------

@router.post("/{course_id}/modules", response_model=ModuleOut, status_code=201, dependencies=[Depends(require_capability("courses.manage_content"))])
async def create_module(course_id: uuid.UUID, body: ModuleCreate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    module = await add_module(db, course, body)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="module.created",
        entity_type="module", entity_id=module.id, entity_label=module.title,
        detail=f"Added module \"{module.title}\" to \"{course.title}\"", course_id=course.id,
    )
    return module


@router.patch("/{course_id}/modules/{module_id}", response_model=ModuleOut, dependencies=[Depends(require_capability("courses.manage_content"))])
async def patch_module(course_id: uuid.UUID, module_id: uuid.UUID, body: ModuleUpdate, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)  # also doubles as the ownership check
    module = await _get_module_or_404(db, module_id, course_id)
    if body.restrictions is not None:
        other_ids = {m.id for m in course.modules if m.id != module_id}
        for r in body.restrictions:
            if r.type == "module_score" and r.module_id not in other_ids:
                raise HTTPException(status_code=400, detail="That module_score restriction references a module that isn't on this course")
    changed = sorted(body.model_dump(exclude_unset=True))
    updated = await update_module(db, module, body, current_user.org_id)
    if changed:
        # Every module Save, even one touching only quiz `questions` or
        # `restrictions`, lands here — per the admin's own scope: "module
        # changes ho to module save karana hoga". One line per save, not
        # a field-by-field diff (see AuditLog's docstring on why detail
        # stays a flat human-readable string).
        await audit_log_service.record(
            db, org_id=current_user.org_id, actor=current_user, action="module.updated",
            entity_type="module", entity_id=module.id, entity_label=updated.title,
            detail=f"Updated module \"{updated.title}\" on \"{course.title}\": {', '.join(changed)}", course_id=course.id,
        )
    return updated


@router.delete("/{course_id}/modules/{module_id}", status_code=204, dependencies=[Depends(require_capability("courses.manage_content"))])
async def delete_module(course_id: uuid.UUID, module_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    module = await _get_module_or_404(db, module_id, course_id)
    title = module.title
    await db.delete(module)
    await db.commit()
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="module.deleted",
        entity_type="module", entity_id=module_id, entity_label=title,
        detail=f"Deleted module \"{title}\" from \"{course.title}\"", course_id=course.id,
    )


@router.post("/{course_id}/modules/reorder", status_code=204, dependencies=[Depends(require_capability("courses.manage_content"))])
async def reorder(course_id: uuid.UUID, body: ModuleReorderRequest, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    await reorder_modules(db, course, body.module_ids)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="course.modules_reordered",
        entity_type="course", entity_id=course.id, entity_label=course.title,
        detail=f"Reordered modules on \"{course.title}\"", course_id=course.id,
    )


@router.post("/{course_id}/modules/{module_id}/upload", response_model=ModuleOut, dependencies=[Depends(require_capability("courses.manage_content"))])
async def upload_module_file(
    course_id: uuid.UUID, module_id: uuid.UUID, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Real file upload for a WATCH (video) or READ (PDF/DOC/PPT) module —
    stored in object storage (R2 in production), validated by type/size
    for the module's kind. Replaces any file the module already had."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    module = await _get_module_or_404(db, module_id, course_id)
    if module.type.value not in ("watch", "read"):
        raise HTTPException(status_code=400, detail="This module type doesn't accept a file upload")
    updated = await upload_module_content(db, module, file, current_user.org_id, current_user)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="module.file_uploaded",
        entity_type="module", entity_id=module.id, entity_label=updated.title,
        detail=f"Replaced file on module \"{updated.title}\" ({file.filename}) on \"{course.title}\"", course_id=course.id,
    )
    return updated


@router.delete("/{course_id}/modules/{module_id}/file", status_code=204, dependencies=[Depends(require_capability("courses.manage_content"))])
async def delete_module_file(
    course_id: uuid.UUID, module_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    module = await _get_module_or_404(db, module_id, course_id)
    await remove_module_content(db, module)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="module.file_removed",
        entity_type="module", entity_id=module.id, entity_label=module.title,
        detail=f"Removed file from module \"{module.title}\" on \"{course.title}\"", course_id=course.id,
    )


@router.post("/{course_id}/modules/{module_id}/scorm-upload", response_model=ModuleOut, dependencies=[Depends(require_capability("courses.manage_content"))])
async def upload_scorm(
    course_id: uuid.UUID, module_id: uuid.UUID, file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    """Unpacks a SCORM 1.2/2004 .zip and points the module at its launch
    file — see scorm_service.parse_zip for the manifest parsing."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    module = await _get_module_or_404(db, module_id, course_id)
    if module.type != ModuleType.SCORM:
        raise HTTPException(status_code=400, detail="This module isn't a SCORM module")
    updated = await upload_scorm_package(db, module, file, current_user.org_id, current_user)
    await audit_log_service.record(
        db, org_id=current_user.org_id, actor=current_user, action="module.scorm_uploaded",
        entity_type="module", entity_id=module.id, entity_label=updated.title,
        detail=f"Replaced SCORM package on module \"{updated.title}\" ({file.filename}) on \"{course.title}\"", course_id=course.id,
    )
    return updated


@router.get("/{course_id}/modules/{module_id}/scorm-content/{file_path:path}")
async def get_scorm_content(
    course_id: uuid.UUID, module_id: uuid.UUID, file_path: str,
    db: AsyncSession = Depends(get_db), current_user: User | None = Depends(get_optional_user_via_header_or_query),
):
    """Streams one file out of a module's unpacked SCORM package. Loaded as
    a plain browser navigation for the ENTRY file — the player's
    <iframe src=".../index.html?token=...">, which does carry a real
    token and gets the full per-learner assignment/lock check below —
    but every file the package's own HTML/CSS/JS then references
    relatively (<script src="assets/app.js">, <link>, <img>, an XHR for
    another asset) is requested by the browser with NO query string at
    all, token included: a relative URL reference never inherits the
    base page's query string (see get_optional_user_via_header_or_query's
    docstring). Those requests arrive with current_user=None here, and
    are served on UUID-obscurity alone (course_id/module_id, both
    unguessable) — the same trust level a WATCH/READ module's file_url
    already gets as a presigned R2 URL with no app auth at all."""
    if current_user is not None:
        course = await get_course_or_404(db, course_id, current_user.org_id)
    else:
        result = await db.execute(select(Course).where(Course.id == course_id))
        course = result.scalar_one_or_none()
        if course is None:
            raise HTTPException(status_code=404, detail="Course not found")
    module = await _get_module_or_404(db, module_id, course_id)
    if module.type != ModuleType.SCORM or not module.file_key:
        raise HTTPException(status_code=404, detail="No SCORM package on this module")

    # Org Admin / Team Lead can always preview; a Learner only if this
    # course is actually assigned to them (same rule get_my_course uses).
    # Skipped entirely for a token-less sub-resource request (current_user
    # is None) — see this endpoint's docstring for why that's safe.
    if current_user is not None and current_user.role == RoleName.LEARNER:
        result = await db.execute(select(Course.id).where(Course.id == course_id, or_(*_assigned_to(current_user))))
        if result.scalar_one_or_none() is None:
            raise HTTPException(status_code=404, detail="Course not found")
        # Same lock gate as get_my_course's stripped file_url — a learner
        # who already has (or guesses) the content URL from a prior
        # unlocked state can't keep hitting it after a course gets locked
        # out from under them, or by typing the path directly.
        done = await progress_svc.completed_map(db, current_user.id)
        locked, reason = progress_svc.module_locked(course, module, done, current_user)
        if locked:
            raise HTTPException(status_code=403, detail=reason or "This module is locked.")

    # Each file inside the package is its own `files` row, keyed by its
    # relative path within the zip (see course_service.upload_scorm_package)
    # — module.file_key is just a "content exists" marker now, not a
    # concatenable object-storage prefix.
    record = await storage_service.find_file(db, component="mod_scorm", filearea="package", itemid=module.id, filepath=file_path)
    if record is None:
        raise HTTPException(status_code=404, detail="File not found in this package")
    data = storage_service.get_bytes(storage_service.file_key(record))
    if data is None:
        raise HTTPException(status_code=404, detail="File not found in this package")
    content_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    return Response(content=data, media_type=content_type)


async def _get_module_or_404(db: AsyncSession, module_id: uuid.UUID, course_id: uuid.UUID) -> Module:
    result = await db.execute(select(Module).where(Module.id == module_id, Module.course_id == course_id))
    module = result.scalar_one_or_none()
    if module is None:
        raise HTTPException(status_code=404, detail="Module not found on this course")
    return module


# ---------------------------------------------------------------- Ratings --
# See course_rating_service for eligibility/moderation rules. The public
# summary (average/count/distribution) is open to anyone in the org —
# that's the whole point of a rating badge on the catalog — but a plain
# learner never gets the individual reviews, not even anonymized: they
# see only their own rating (GET /ratings/me) plus the aggregate. The
# full list, WITH reviewer identity, is for an Org Admin or this
# course's own creator only (GET /ratings/admin). Submitting a rating
# requires actually being enrolled + having finished the first module;
# moderating someone else's review requires the same admin/creator
# check as viewing the list.

async def _get_rating_or_404(db: AsyncSession, course_id: uuid.UUID, rating_id: uuid.UUID) -> CourseRating:
    row = (await db.execute(select(CourseRating).where(CourseRating.id == rating_id, CourseRating.course_id == course_id))).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Review not found")
    return row


@router.get("/{course_id}/ratings/summary", response_model=CourseRatingSummary)
async def get_course_rating_summary(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_course_or_404(db, course_id, current_user.org_id)
    return await rating_svc.summary(db, course_id)


@router.get("/{course_id}/ratings/me", response_model=MyCourseRatingOut | None)
async def get_my_course_rating(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    await get_course_or_404(db, course_id, current_user.org_id)
    row = (await db.execute(
        select(CourseRating).where(CourseRating.course_id == course_id, CourseRating.user_id == current_user.id)
    )).scalar_one_or_none()
    return row


@router.get("/{course_id}/ratings/eligibility")
async def get_rating_eligibility(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Lets the frontend decide whether to even show "Rate this course"
    without the learner having to guess by submitting and seeing a 400."""
    course = await get_course_or_404(db, course_id, current_user.org_id)
    ok, reason = await rating_svc.can_rate(db, course, current_user)
    return {"can_rate": ok, "reason": reason}


@router.post("/{course_id}/ratings", response_model=MyCourseRatingOut, status_code=201)
async def submit_course_rating(course_id: uuid.UUID, body: CourseRatingIn, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    ok, reason = await rating_svc.can_rate(db, course, current_user)
    if not ok:
        raise HTTPException(status_code=400, detail=reason)

    existing = (await db.execute(
        select(CourseRating).where(CourseRating.course_id == course_id, CourseRating.user_id == current_user.id)
    )).scalar_one_or_none()
    if existing:
        existing.rating = body.rating
        existing.review_text = body.review_text
        row = existing
    else:
        row = CourseRating(org_id=current_user.org_id, course_id=course_id, user_id=current_user.id, rating=body.rating, review_text=body.review_text)
        db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


@router.get("/{course_id}/ratings/admin", response_model=list[CourseRatingAdminOut])
async def list_course_ratings_admin(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    if not rating_svc.can_moderate(course, current_user):
        raise HTTPException(status_code=403, detail="Only an Org Admin or this course's own creator can view this")
    rows = (await db.execute(
        select(CourseRating, User).join(User, User.id == CourseRating.user_id)
        .where(CourseRating.course_id == course_id).order_by(CourseRating.created_at.desc())
    )).all()
    return [
        CourseRatingAdminOut(
            id=r.id, rating=r.rating, review_text=r.review_text, created_at=r.created_at,
            user_id=u.id, user_name=f"{u.firstname} {u.lastname}".strip(), user_email=u.email,
        )
        for r, u in rows
    ]


@router.patch("/{course_id}/ratings/{rating_id}", response_model=CourseRatingAdminOut)
async def moderate_course_rating(
    course_id: uuid.UUID, rating_id: uuid.UUID, body: CourseRatingModerateUpdate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    if not rating_svc.can_moderate(course, current_user):
        raise HTTPException(status_code=403, detail="Only an Org Admin or this course's own creator can edit this")
    row = await _get_rating_or_404(db, course_id, rating_id)
    row.review_text = body.review_text
    await db.commit()
    await db.refresh(row)
    author = await db.get(User, row.user_id)
    return CourseRatingAdminOut(
        id=row.id, rating=row.rating, review_text=row.review_text, created_at=row.created_at,
        user_id=author.id, user_name=f"{author.firstname} {author.lastname}".strip(), user_email=author.email,
    )


@router.delete("/{course_id}/ratings/{rating_id}", status_code=204)
async def delete_course_rating(course_id: uuid.UUID, rating_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    if not rating_svc.can_moderate(course, current_user):
        raise HTTPException(status_code=403, detail="Only an Org Admin or this course's own creator can delete this")
    row = await _get_rating_or_404(db, course_id, rating_id)
    await db.delete(row)
    await db.commit()


# ---------- Announcements ----------
# A flat per-course announcement board (see models/course_announcement.py).
# Anyone who can reach the course at all gets the non-hidden list;
# adding, editing, hiding, and deleting are all gated by the same
# can_manage check (Org/Super Admin, or one of this course's own
# Teachers) — the feature doesn't distinguish "who can add" from "who
# can moderate", unlike ratings, since there's no separate "learner
# submission" here to protect.

async def _get_announcement_or_404(db: AsyncSession, course_id: uuid.UUID, announcement_id: uuid.UUID) -> CourseAnnouncement:
    row = (await db.execute(
        select(CourseAnnouncement).where(CourseAnnouncement.id == announcement_id, CourseAnnouncement.course_id == course_id)
    )).scalar_one_or_none()
    if row is None:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return row


@router.get("/{course_id}/announcements", response_model=list[CourseAnnouncementOut])
async def list_course_announcements(course_id: uuid.UUID, db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user)):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    include_hidden = announce_svc.can_manage(course, current_user)
    return await announce_svc.list_for(db, course_id, include_hidden)


@router.post("/{course_id}/announcements", response_model=CourseAnnouncementOut, status_code=201)
async def create_course_announcement(
    course_id: uuid.UUID, body: CourseAnnouncementIn,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    if not announce_svc.can_manage(course, current_user):
        raise HTTPException(status_code=403, detail="Only an Org Admin or this course's own Teacher can post an announcement")
    row = CourseAnnouncement(
        org_id=current_user.org_id, course_id=course_id, author_user_id=current_user.id,
        title=body.title.strip(), body=body.body.strip(),
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return await announce_svc.to_out(db, row)


@router.patch("/{course_id}/announcements/{announcement_id}", response_model=CourseAnnouncementOut)
async def update_course_announcement(
    course_id: uuid.UUID, announcement_id: uuid.UUID, body: CourseAnnouncementUpdate,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    if not announce_svc.can_manage(course, current_user):
        raise HTTPException(status_code=403, detail="Only an Org Admin or this course's own Teacher can edit this")
    row = await _get_announcement_or_404(db, course_id, announcement_id)
    data = body.model_dump(exclude_unset=True)
    if "title" in data:
        row.title = data["title"].strip()
    if "body" in data:
        row.body = data["body"].strip()
    if "is_hidden" in data:
        row.is_hidden = data["is_hidden"]
    await db.commit()
    await db.refresh(row)
    return await announce_svc.to_out(db, row)


@router.delete("/{course_id}/announcements/{announcement_id}", status_code=204)
async def delete_course_announcement(
    course_id: uuid.UUID, announcement_id: uuid.UUID,
    db: AsyncSession = Depends(get_db), current_user: User = Depends(get_current_user),
):
    course = await get_course_or_404(db, course_id, current_user.org_id)
    if not announce_svc.can_manage(course, current_user):
        raise HTTPException(status_code=403, detail="Only an Org Admin or this course's own Teacher can delete this")
    row = await _get_announcement_or_404(db, course_id, announcement_id)
    await db.delete(row)
    await db.commit()

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseEnrolmentPaymentStatus(str, enum.Enum):
    CREATED = "created"  # Razorpay order created, checkout not completed yet
    PAID = "paid"
    FAILED = "failed"


class CourseEnrolmentPayment(Base):
    """One row per paid-enrolment checkout attempt — same shape and
    lifecycle as OrgPayment (see that model's docstring), just scoped to
    a single course/learner instead of an org/plan. Created the moment
    POST /courses/{id}/enrol/checkout mints a Razorpay order, then moved
    to PAID or FAILED by whichever of /courses/{id}/enrol/verify (the
    client-side redirect callback) or billing.py's shared
    /billing/webhook/razorpay (which checks this table too — see that
    function) hears about it first. Paying enrols the learner
    (course_service.activate_course_payment adds them to
    Course.assigned_user_ids); nothing else about the course changes."""
    __tablename__ = "course_enrolment_payments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)

    # Paise — same convention as OrgPayment.amount.
    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="INR", nullable=False)

    razorpay_order_id: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    razorpay_payment_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    razorpay_signature: Mapped[str | None] = mapped_column(String(200), nullable=True)

    status: Mapped[CourseEnrolmentPaymentStatus] = mapped_column(
        Enum(CourseEnrolmentPaymentStatus, name="courseenrolmentpaymentstatus"),
        default=CourseEnrolmentPaymentStatus.CREATED, nullable=False,
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

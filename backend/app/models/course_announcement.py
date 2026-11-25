import uuid
from datetime import datetime, timezone

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CourseAnnouncement(Base):
    """A course's announcement board — same idea as Moodle's course
    "Announcements" forum, simplified to a flat list of posts (no
    replies/threads) since nothing in this app's scope needs that.

    One row is auto-seeded the moment a course is created (see
    course_announcement_service.seed_default, called from
    POST /courses right after the course itself is committed) so every
    course always has at least a welcome note — same "ships with a
    sensible default, not an empty state" reasoning as
    WhatsAppTemplate's DEFAULT_WHATSAPP_TEMPLATES. That seeded row isn't
    special once created: it's just an ordinary announcement a manager
    can edit, hide, or delete exactly like one they add themselves —
    there is deliberately no is_default flag locking it down.

    is_hidden is distinct from deletion: hiding keeps the row (and its
    history) but drops it from the learner-facing GET list, while
    deleting removes it outright — gives a manager an undo-able "take
    this down for now" in addition to the permanent action, matching
    the user's own "hide, remove, delete" phrasing as three distinct
    verbs.

    Who may add/edit/hide/delete (see course_announcement_service.
    can_manage): Org/Super Admin, or one of this course's own Teachers
    (Course.teacher_user_ids) — the exact same population as
    course_rating_service.can_moderate, reused rather than
    reimplemented. Anyone who can see the course at all (enrolled
    learner, teacher, admin) can read the non-hidden list.

    comments_enabled gates its own discussion thread (see
    CourseAnnouncementComment below) — true by default (the common
    case: a question under an announcement is welcome), a manager can
    turn it off per-announcement for a pure one-way notice. When off,
    NO ONE can post a new comment through that endpoint, managers
    included — there's no half-open state to reason about; a manager
    who wants to add more just edits the announcement body itself.
    """
    __tablename__ = "course_announcements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    course_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False, index=True)
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    is_hidden: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    comments_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )


class CourseAnnouncementComment(Base):
    """One reply in an announcement's own discussion thread — visible
    to, and postable by, anyone `course_rating_service.is_enrolled`
    says can see this course (an enrolled learner, this course's own
    Teacher, or an Org/Super Admin — the same population, since a
    discussion under an announcement is scoped to the people the
    announcement is actually for, not every org member who happens to
    be able to list the course). Deleting a comment (moderation) is
    narrower: course_announcement_service.can_manage only (Teacher/
    Admin), same as the announcement itself.

    Flat — no reply-to-a-reply nesting — matching the announcement
    board itself being a flat list, not a full forum."""
    __tablename__ = "course_announcement_comments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    announcement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("course_announcements.id"), nullable=False, index=True)
    author_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    body: Mapped[str] = mapped_column(Text, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

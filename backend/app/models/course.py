import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Course(Base):
    """
    Full course entity — plain CRUD plus assignment and certificate config.
    What was originally speculated as a separate `course_rules` table
    (see that file's note) is just the certificate_* columns here: there
    was only ever one "rule" at the course level (does finishing it award
    a certificate, and with what template/name), so a join table for that
    was overhead with no payoff.

    Deliberately NOT here: AI authoring pipeline output, enrollment
    records, or anything about a specific learner's progress — those
    are separate, larger, still-unbuilt pieces (see docs/architecture.md §5).
    """
    __tablename__ = "courses"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    category_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("categories.id"), nullable=True)

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_label: Mapped[str] = mapped_column(String(50), default="")  # display string e.g. "45 min" — not used for any calculation

    # Both optional. opens_at: before this, the course exists (admin can
    # build/assign it) but a learner can't open or progress it yet.
    # closes_at: a hard enrollment/completion cutoff — past it, no new
    # assignment and no further progress from a learner, but admin edit
    # access and anything already completed (certs, scores) stays intact.
    opens_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Assignment — soft references to Team/User, same reasoning as Module.skill_ids:
    # union-merged on assign, never replaced, so re-assigning never drops an existing team.
    assigned_team_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    assigned_user_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)

    # Certificate on completion — soft-referenced badge_ids (Badge table exists now,
    # but badge_ids stays a plain array since Postgres can't FK individual array
    # elements without a join table). certificate_template_id IS a real FK now
    # that CertTemplate exists.
    certificate_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    certificate_template_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("cert_templates.id"), nullable=True)
    certificate_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    certificate_org_name: Mapped[str | None] = mapped_column(String(300), nullable=True)
    badge_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)

    # Completion rules — both optional, both off by default so an existing
    # course's behavior never changes until an admin opts in.
    #
    # completion_module_ids: when non-empty, the course counts as complete
    # the moment EVERY module in this list is done, instead of the default
    # "every required module done" rule (see learn_service.course_progress)
    # — e.g. "video + quiz together complete the course" even if a 3rd,
    # required SCORM module is still sitting there unfinished. A plain
    # UUID array, not a join table or FK, same reasoning as
    # skill_ids/badge_ids below — validated at the API layer (courses.py),
    # which drops any id for a module that gets deleted.
    completion_module_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list)
    # sequential_unlock: when true, a learner must finish module N (by
    # position order) before module N+1's content or completion becomes
    # reachable at all — the "video > scorm > quiz > certificate" chain.
    # False (the default) leaves every module open in any order, same as
    # before this existed.
    sequential_unlock: Mapped[bool] = mapped_column(Boolean, default=False)
    # completion_mode: only matters when completion_module_ids is
    # non-empty (see above) — "all" (default) requires every listed
    # module to be done, "any" requires just one of them. Mirrors
    # Moodle's "Condition requires: ALL/ANY selected activities" control.
    # Plain string, not a DB enum, for the same cheap-migration reasons
    # as everywhere else in this file — validated as a Literal at the API
    # layer (schemas/course.py).
    completion_mode: Mapped[str] = mapped_column(String(10), default="all", nullable=False)

    # Course cover image — same dedup-ledger pattern as a module's own
    # file (see Module.file_key / storage_service.store_file): a storage
    # object key, not a URL, so the actual presigned URL is always
    # generated fresh on read (CourseOut._resolve_cover_image_url) and
    # never goes stale. Null = no cover set, the course card falls back
    # to its own placeholder.
    cover_image_key: Mapped[str | None] = mapped_column(String(500), nullable=True)

    org: Mapped["Org"] = relationship()
    # lazy="selectin": both of these get read into CourseOut on every
    # response. Left as the SQLAlchemy default (lazy="select"), accessing
    # them outside an awaited query — which is exactly what happens when
    # FastAPI serializes the response — raises MissingGreenlet under an
    # async session. selectin makes them load as an automatic follow-up
    # query during the original `await db.execute(select(Course)...)`
    # instead, so they're already in memory by the time serialization
    # (synchronous) touches them.
    category: Mapped["Category | None"] = relationship(lazy="selectin")
    modules: Mapped[list["Module"]] = relationship(
        back_populates="course", cascade="all, delete-orphan", order_by="Module.position", lazy="selectin"
    )

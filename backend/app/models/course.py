import uuid

from sqlalchemy import ARRAY, Boolean, ForeignKey, String, Text
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

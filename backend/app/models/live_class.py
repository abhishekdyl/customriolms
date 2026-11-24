import uuid
from datetime import datetime, timezone

from sqlalchemy import ARRAY, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LiveClassProvider:
    BIGBLUEBUTTON = "bigbluebutton"
    ZOOM = "zoom"


class LiveClassTargetScope:
    ALL = "all"            # every active user in the org
    TEAM = "team"          # one team's members, directly — not via any course
    COURSE = "course"      # one course's enrolled learners (direct + team, same as ReminderRule)
    INDIVIDUAL = "individual"  # a hand-picked list of users


class LiveClass(Base):
    """A scheduled video session — the admin/instructor-facing half of
    "Live Classes". See join_service (or wherever get_join_url lands)
    for the provider-specific part; this row is just the schedule +
    who it's for.

    Status is never stored — it's derived from scheduled_start +
    duration_minutes vs now (see live_class_service.compute_status), so
    a class never needs a background job just to flip from "scheduled"
    to "live" to "ended"; the same three states are computed fresh on
    every read.

    target_scope mirrors ReminderRule's own all/course split, plus a
    third option this feature specifically asked for — "individual",
    a hand-picked list of users (course/all cover "a course's learners"
    and "the whole org"; neither covers "just these three people")."""
    __tablename__ = "live_classes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)

    title: Mapped[str] = mapped_column(String(300), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    provider: Mapped[str] = mapped_column(String(20), nullable=False)  # LiveClassProvider
    scheduled_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60, nullable=False)

    target_scope: Mapped[str] = mapped_column(String(12), default="all", nullable=False)  # LiveClassTargetScope
    course_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True)
    team_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=True)  # target_scope == team
    user_ids: Mapped[list[uuid.UUID]] = mapped_column(ARRAY(UUID(as_uuid=True)), default=list, nullable=False)  # target_scope == individual

    # ---- BigBlueButton — meeting is created lazily on first join, not
    # at schedule time (a BBB room left empty just expires on the
    # server, so there's nothing to gain from creating it early; same
    # behaviour as Moodle's own plugin). bbb_created flips to True the
    # first time anyone actually joins.
    bbb_meeting_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    bbb_moderator_pw: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bbb_attendee_pw: Mapped[str | None] = mapped_column(String(64), nullable=True)
    bbb_created: Mapped[bool] = mapped_column(default=False, nullable=False)

    # ---- Zoom — created eagerly, right when the class is scheduled
    # (Zoom's API is meant to be used this way — the meeting exists and
    # is listable/editable in the host's own Zoom account immediately,
    # not conjured on first join like BBB's).
    zoom_meeting_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    zoom_join_url: Mapped[str | None] = mapped_column(String(500), nullable=True)   # attendees
    zoom_start_url: Mapped[str | None] = mapped_column(String(500), nullable=True)  # host only

    # Pasted in by hand after the session (Zoom/Drive/BBB recording
    # link, whatever the admin actually has) — no provider here auto-
    # fills this; see this feature's own "recording: keep it manual"
    # scope decision.
    recording_url: Mapped[str | None] = mapped_column(String(500), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

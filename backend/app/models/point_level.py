import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class PointLevel(Base):
    """
    An Org Admin's leaderboard tier ("Levels/Tiers" section of the
    Recognition page's Leaderboard tab) — e.g. level1 = 0-50 pts,
    level2 = 51-100, ... A learner's tier is whichever level's
    [min_points, max_points] range contains their current total (see
    learn_service.resolve_tier); max_points=None means "and above", for
    an open-ended top tier. No tier matching (points below every
    level's min_points, e.g. before any level is configured at all, or
    a learner with 0 points and every level starting above 0) shows as
    "Unranked" — resolve_tier returns None, never raises.

    image_key is the same content-addressed storage_service pattern as
    Course.cover_image_key (component="point_level", filearea="image",
    itemid=this row's id) — resolved to a presigned image_url on read,
    see PointLevelOut.
    """
    __tablename__ = "point_levels"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    min_points: Mapped[int] = mapped_column(Integer, nullable=False)
    max_points: Mapped[int | None] = mapped_column(Integer, nullable=True)
    color: Mapped[str] = mapped_column(String(9), default="#778899", nullable=False)
    image_key: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    org: Mapped["Org"] = relationship()

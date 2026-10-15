import uuid
from datetime import datetime, timezone

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class FileRecord(Base):
    """
    Moodle-style file registry: one row per *logical use* of an uploaded
    file (a module's video, a question's image, a user's avatar, ...),
    separate from the *physical* bytes on disk/R2, which are
    content-addressed by contenthash and genuinely deduplicated — the
    same video re-uploaded, or the same image used on two questions,
    is written to storage exactly once no matter how many rows point at
    it, so riolmsdata (or the R2 bucket) never grows for a repeat.

    Mirrors Moodle's own `files` table: contenthash (sha256 of the bytes)
    + pathnamehash (identifies "this exact logical slot" —
    component/filearea/itemid/filepath/filename) are the two hashes that
    do the real work; everything else here is bookkeeping a Moodle admin
    would recognize (component/filearea/itemid instead of a contextid
    tree, since this app is already org-scoped rather than Moodle's
    general context hierarchy).

    component/filearea/itemid describe WHERE a file is used, the same
    three-part key Moodle's file API takes everywhere:
      - ("mod_watch" | "mod_read", "content", module_id)   — a module's own file
      - ("mod_scorm", "package", module_id)                — one row per file inside an unpacked SCORM zip (filepath differs)
      - ("question", "image", null)                        — a quiz/option image, uploaded before the question exists to attach it to
      - ("user", "avatar", user_id)                        — a learner/admin's profile picture

    A caller doesn't need to join this table to use a file day-to-day —
    the owning row (Module.file_key, Question option.image_key, ...)
    still stores the plain storage key returned by
    storage_service.store_file, exactly as before this table existed.
    This table is the dedup ledger + "what's been uploaded, by whom,
    where" index underneath that, not a new indirection every read has
    to go through.
    """
    __tablename__ = "files"
    __table_args__ = (UniqueConstraint("pathnamehash", name="uq_files_pathnamehash"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)

    # sha256 of the raw bytes — NOT unique; many rows legitimately share
    # one contenthash (that's the whole point of dedup). Indexed because
    # "how many rows reference this content" is the deletion-safety check
    # (see storage_service._gc_if_orphaned).
    contenthash: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    # sha256 of f"{component}/{filearea}/{itemid}/{filepath}/{filename}" —
    # unique: this is "the one row for this logical slot". Re-uploading
    # into the same slot (e.g. replacing a module's video) updates this
    # same row's contenthash rather than creating a second one.
    pathnamehash: Mapped[str] = mapped_column(String(64), nullable=False)

    component: Mapped[str] = mapped_column(String(100), nullable=False)
    filearea: Mapped[str] = mapped_column(String(100), nullable=False)
    itemid: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    filepath: Mapped[str] = mapped_column(String(300), default="/")
    filename: Mapped[str] = mapped_column(String(300), nullable=False)

    userid: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    filesize: Mapped[int] = mapped_column(BigInteger, default=0)
    mimetype: Mapped[str | None] = mapped_column(String(150), nullable=True)
    status: Mapped[int] = mapped_column(Integer, default=0)  # 0 = active; reserved, not used yet

    # Snapshot text fields, Moodle-style — author is the uploader's name
    # *at upload time* (not a live join, so it survives the user being
    # renamed or removed), source is the original filename if storage
    # ever renames it, license defaults to "unknown" same as Moodle.
    source: Mapped[str | None] = mapped_column(String(500), nullable=True)
    author: Mapped[str | None] = mapped_column(String(200), nullable=True)
    license: Mapped[str] = mapped_column(String(100), default="unknown")
    sortorder: Mapped[int] = mapped_column(Integer, default=0)
    # Kept for schema parity with Moodle's own files table (file aliases
    # referencing another file's row); nothing in this app creates an
    # alias yet, so this is always null here.
    referencefileid: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    timecreated: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    timemodified: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc), nullable=False,
    )

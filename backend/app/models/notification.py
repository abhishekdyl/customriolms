import uuid
from datetime import date, datetime, timezone

from sqlalchemy import ARRAY, Boolean, Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class NotificationTemplate(Base):
    """Email template an org's reminder/invite emails are rendered from.
    {{learner_name}}-style variables are filled in per recipient at send time."""
    __tablename__ = "notification_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    # System templates (e.g. Welcome invite) can be edited but not deleted.
    editable: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)


class ReminderRule(Base):
    """Two different kinds of rule share this one table:

    - before_due/on_due/overdue — fire relative to a COURSE's own due
      date (that course's learners only); `days` is the offset. Unaffected
      by anything below — this is the existing, working behaviour.
    - on_date/weekly/monthly — a scheduled rule tied to the CALENDAR, not
      any particular course's due date: "send on 5 Dec", "send every
      Monday at 9am", "send on the 1st of every month". These are the
      new types this model grew to support (replacing the old, never-
      actually-fired weekly_digest trigger). See notification_service's
      compute_next_fire for how next_fire_at is derived from the fields
      below, and tick()/fire_rule() for how a due one actually sends.

    target_scope/course_id apply to the calendar-based rules only — who
    receives it: every active user in the org, or only the learners
    assigned to one specific course (direct + team assignment, same
    resolution course_service.list_enrolled uses)."""
    __tablename__ = "reminder_rules"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    trigger: Mapped[str] = mapped_column(String(30), nullable=False)  # before_due | on_due | overdue | on_date | weekly | monthly
    days: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    channels: Mapped[list[str]] = mapped_column(ARRAY(String), default=list, nullable=False)  # email | inapp | push
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)

    # ---- calendar-based rules (on_date / weekly / monthly) ----
    # "HH:MM", 24-hour, interpreted in the org's own Org.timezone.
    fire_time: Mapped[str] = mapped_column(String(5), default="09:00", nullable=False)
    # on_date only — the one calendar date it fires on.
    fire_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # weekly/monthly only — fire every N weeks/months, not necessarily 1.
    interval: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    # weekly only — 0=Monday .. 6=Sunday; can be more than one day.
    days_of_week: Mapped[list[int]] = mapped_column(ARRAY(Integer), default=list, nullable=False)
    # monthly only — day-of-month to fire on (1-31; clamped to a shorter
    # month's last day, e.g. 31 fires on the 28th/29th in February).
    day_of_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # weekly/monthly only, optional — recursion stops after this date
    # ("till date"); None = runs indefinitely until disabled by hand.
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    # all = every active user in the org; course = only that course's
    # enrolled learners (direct + team assignment).
    target_scope: Mapped[str] = mapped_column(String(10), default="all", nullable=False)
    course_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True)
    # Sent as-is (no {{variables}}) — kept simple since this isn't tied
    # to a learner/course context the way the Templates tab's own
    # {{learner_name}}-style mail-merge is.
    subject: Mapped[str] = mapped_column(String(300), default="Reminder", nullable=False)
    message: Mapped[str] = mapped_column(Text, default="This is a scheduled reminder.", nullable=False)
    # Bookkeeping for the dispatcher (notification_service.tick): the
    # next time this rule is due to fire, kept precomputed and indexed
    # so a tick is one cheap "next_fire_at <= now" query, not a per-rule
    # recurrence calculation on every pass. Recomputed on every create/
    # update and after each fire. NULL for before_due/on_due/overdue
    # (those aren't on this clock at all) and for a one-time on_date
    # rule that has already fired.
    next_fire_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_fired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class OrgSmtpSettings(Base):
    """One row per org, only when the org opts into its own mail server."""
    __tablename__ = "org_smtp_settings"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), primary_key=True)
    use_custom: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    host: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=587, nullable=False)
    encryption: Mapped[str] = mapped_column(String(10), default="TLS", nullable=False)  # TLS | SSL | None
    username: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    # NOTE: stored as plain text for now — encrypt at rest (e.g. Fernet with a server key) before production.
    password: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    from_name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    from_email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    # Fallback-to-platform-SMTP request/approval state (3-tier SMTP: org's
    # own SMTP > approved platform fallback > nowhere to send). An org with
    # no SMTP credentials of its own can ask to borrow the platform's;
    # nothing is sent through it until a Super Admin approves.
    # none | requested | approved | denied
    fallback_status: Mapped[str] = mapped_column(String(10), default="none", nullable=False)
    fallback_requested_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    fallback_decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class EmailLog(Base):
    """One row per outbound-mail attempt (password resets, reminders,
    invites, SMTP test sends — anything that goes through notification_
    service's send paths) — the audit trail for "kis ko kab kaunsa mail
    gaya": who it was addressed to, what it was, which SMTP it went
    through (or why it didn't go at all), and when."""
    __tablename__ = "email_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    to_addr: Mapped[str] = mapped_column(String(255), nullable=False)
    subject: Mapped[str] = mapped_column(String(300), nullable=False)
    # org | platform | none — which SMTP it was sent through (or attempted
    # through); "none" means there was nowhere to send it at all.
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    # sent | failed | skipped — skipped means no SMTP was configured/
    # approved, so sending was never even attempted.
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    detail: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)


class OrgWhatsAppSettings(Base):
    """One row per org, only when the org opts into WhatsApp notifications —
    its own SendZen credentials (SendZen is a wrapper over the official
    WhatsApp Cloud API; see whatsapp_service for the HTTP calls). Unlike
    SMTP, there's deliberately no platform-shared fallback tier: a
    WhatsApp Business sender number is org-specific by nature (each org's
    own number, own approved templates), so "no settings here" just means
    the feature is off for that org — see whatsapp_service.resolve_settings."""
    __tablename__ = "org_whatsapp_settings"

    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # NOTE: stored as plain text for now — encrypt at rest (e.g. Fernet
    # with a server key) before production, same caveat as OrgSmtpSettings.
    api_key: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    # The org's own WhatsApp Business number, E.164 digits with no "+"
    # (SendZen's own `from` convention) — see core.phone.whatsapp_recipient.
    from_number: Mapped[str] = mapped_column(String(20), default="", nullable=False)


class WhatsAppTemplate(Base):
    """One row per org per message kind — which of the org's own
    Meta-approved WhatsApp templates (created/approved in SendZen's
    dashboard, not here — see notifications-settings guide) to use for
    each of this app's built-in triggers. Unlike NotificationTemplate
    (email), the subject/body text itself lives with Meta/SendZen, not in
    this app — editing it here would do nothing without going through
    Meta's re-approval, so this only stores the already-approved
    template's name/language, which is all a send actually needs."""
    __tablename__ = "whatsapp_templates"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    # certificate_earned | course_launch | webinar_scheduled
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    template_name: Mapped[str] = mapped_column(String(120), default="", nullable=False)
    lang_code: Mapped[str] = mapped_column(String(10), default="en_US", nullable=False)


class WhatsAppLog(Base):
    """One row per outbound-WhatsApp attempt — EmailLog's exact counterpart
    (see that model's docstring), so "kis ko kab kaunsa WhatsApp gaya" has
    the same audit trail shape as email already does."""
    __tablename__ = "whatsapp_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    org_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("orgs.id"), nullable=False, index=True)
    to_phone: Mapped[str] = mapped_column(String(20), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    # sent | failed | skipped — skipped means no phone on file (or an
    # unusable one), or WhatsApp isn't configured/enabled for this org at
    # all; sending was never even attempted either way.
    status: Mapped[str] = mapped_column(String(10), nullable=False)
    detail: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False, index=True)


class PlatformSmtpSettings(Base):
    """Exactly one row (id is the fixed platform_settings.SINGLETON_ID) —
    the Super Admin's shared mail server. Orgs that have no SMTP of their
    own, and have been explicitly approved (see OrgSmtpSettings.fallback_
    status), send their transactional mail through this instead."""
    __tablename__ = "platform_smtp_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    host: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    port: Mapped[int] = mapped_column(Integer, default=587, nullable=False)
    encryption: Mapped[str] = mapped_column(String(10), default="TLS", nullable=False)  # TLS | SSL | None
    username: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    # NOTE: stored as plain text for now — encrypt at rest (e.g. Fernet with a server key) before production.
    password: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    from_name: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    from_email: Mapped[str] = mapped_column(String(255), default="", nullable=False)

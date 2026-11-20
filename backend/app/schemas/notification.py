import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

# before_due/on_due/overdue fire relative to a COURSE's own due date
# (existing behaviour, unchanged). on_date/weekly/monthly are calendar-
# based schedules — see ReminderRule's own docstring for the full split.
Trigger = Literal["before_due", "on_due", "overdue", "on_date", "weekly", "monthly"]
Channel = Literal["email", "inapp", "push"]
TargetScope = Literal["all", "course"]
CALENDAR_TRIGGERS = ("on_date", "weekly", "monthly")


class TemplateIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    subject: str = Field(min_length=1, max_length=300)
    body: str


class TemplateOut(TemplateIn):
    id: uuid.UUID
    editable: bool

    class Config:
        from_attributes = True


class RuleIn(BaseModel):
    trigger: Trigger
    # before_due/overdue only — offset in days from the course's due date.
    days: int = Field(default=0, ge=0, le=365)
    channels: list[Channel] = []
    enabled: bool = True

    # ---- on_date/weekly/monthly only (ignored for before_due/on_due/overdue) ----
    fire_time: str = Field(default="09:00", pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    fire_date: date | None = None  # on_date
    interval: int = Field(default=1, ge=1, le=52)  # weekly/monthly: every N weeks/months
    days_of_week: list[int] = []  # weekly — 0=Mon..6=Sun
    day_of_month: int | None = Field(default=None, ge=1, le=31)  # monthly
    end_date: date | None = None  # weekly/monthly — "till date", optional
    target_scope: TargetScope = "all"
    course_id: uuid.UUID | None = None
    subject: str = Field(default="Reminder", min_length=1, max_length=300)
    message: str = Field(default="This is a scheduled reminder.", min_length=1)

    @model_validator(mode="after")
    def _validate_calendar_fields(self):
        if self.trigger not in CALENDAR_TRIGGERS:
            return self
        if self.trigger == "on_date" and self.fire_date is None:
            raise ValueError("on_date reminders need a date")
        if self.trigger == "weekly" and not self.days_of_week:
            raise ValueError("weekly reminders need at least one day of the week")
        if self.trigger == "weekly" and any(d < 0 or d > 6 for d in self.days_of_week):
            raise ValueError("days_of_week must be 0 (Monday) through 6 (Sunday)")
        if self.trigger == "monthly" and self.day_of_month is None:
            raise ValueError("monthly reminders need a day of the month")
        if self.target_scope == "course" and self.course_id is None:
            raise ValueError("Pick a course when the target is a specific course's users")
        if self.trigger in ("weekly", "monthly") and self.end_date and self.fire_date and self.end_date < self.fire_date:
            raise ValueError("End date can't be before the start date")
        return self


class RuleOut(RuleIn):
    id: uuid.UUID
    # Read-only — set by the backend (see notification_service's
    # compute_next_fire/fire_rule), not something the frontend sends.
    next_fire_at: datetime | None = None
    last_fired_at: datetime | None = None

    class Config:
        from_attributes = True


class SmtpIn(BaseModel):
    use_custom: bool = False
    host: str = ""
    port: int = Field(default=587, ge=1, le=65535)
    encryption: Literal["TLS", "SSL", "None"] = "TLS"
    username: str = ""
    password: str | None = None  # None = keep the stored password
    from_name: str = ""
    from_email: str = ""


FallbackStatus = Literal["none", "requested", "approved", "denied"]


class SmtpOut(BaseModel):
    use_custom: bool
    host: str
    port: int
    encryption: str
    username: str
    has_password: bool
    from_name: str
    from_email: str
    fallback_status: FallbackStatus


class SmtpTestResult(BaseModel):
    ok: bool
    detail: str


class PlatformSmtpIn(BaseModel):
    host: str = ""
    port: int = Field(default=587, ge=1, le=65535)
    encryption: Literal["TLS", "SSL", "None"] = "TLS"
    username: str = ""
    password: str | None = None  # None = keep the stored password
    from_name: str = ""
    from_email: str = ""


class PlatformSmtpOut(BaseModel):
    host: str
    port: int
    encryption: str
    username: str
    has_password: bool
    from_name: str
    from_email: str


class OrgFallbackRequestOut(BaseModel):
    org_id: uuid.UUID
    org_name: str
    status: FallbackStatus
    requested_at: datetime | None = None
    decided_at: datetime | None = None

    class Config:
        from_attributes = True


class EmailLogOut(BaseModel):
    id: uuid.UUID
    to_addr: str
    subject: str
    source: Literal["org", "platform", "none"]
    status: Literal["sent", "failed", "skipped"]
    detail: str
    created_at: datetime

    class Config:
        from_attributes = True


class PlatformEmailLogOut(EmailLogOut):
    org_id: uuid.UUID
    org_name: str

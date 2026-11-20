export const templateVars = ["{{learner_name}}", "{{course_title}}", "{{due_date}}", "{{org_name}}", "{{team_name}}", "{{manager_name}}"];

// before_due/on_due/overdue fire relative to a course's own due date
// (unchanged). on_date/weekly/monthly are calendar-based schedules —
// see the backend's ReminderRule model docstring for the full split.
export type Trigger = "before_due" | "on_due" | "overdue" | "on_date" | "weekly" | "monthly";
export type Channel = "email" | "inapp" | "push";
export type TargetScope = "all" | "course";
export const CALENDAR_TRIGGERS: Trigger[] = ["on_date", "weekly", "monthly"];

export interface NotifTemplate { id: string; name: string; subject: string; body: string; editable: boolean }

export interface ReminderRule {
  id: string;
  trigger: Trigger;
  days: number;  // before_due/overdue only
  channels: Channel[];
  enabled: boolean;
  // on_date/weekly/monthly only (ignored otherwise) — optional on the
  // way in (the backend fills in a sane default for anything omitted),
  // always present on the way back out.
  fire_time?: string;  // "HH:MM", 24h, in the org's own timezone
  fire_date?: string | null;  // on_date — "YYYY-MM-DD"
  interval?: number;  // weekly/monthly — every N weeks/months
  days_of_week?: number[];  // weekly — 0=Mon..6=Sun
  day_of_month?: number | null;  // monthly
  end_date?: string | null;  // weekly/monthly — "till date", optional
  target_scope?: TargetScope;
  course_id?: string | null;
  subject?: string;
  message?: string;
  // Read-only, set by the backend.
  next_fire_at?: string | null;
  last_fired_at?: string | null;
}

/** Org's own SMTP ▸ approved platform fallback ▸ nowhere to send — see
 * notification_service.resolve_send_source on the backend. */
export type FallbackStatus = "none" | "requested" | "approved" | "denied";

export interface SmtpSettings {
  use_custom: boolean; host: string; port: number; encryption: "TLS" | "SSL" | "None";
  username: string; has_password: boolean; from_name: string; from_email: string;
  fallback_status: FallbackStatus;
}

export interface PlatformSmtpSettings {
  host: string; port: number; encryption: "TLS" | "SSL" | "None";
  username: string; has_password: boolean; from_name: string; from_email: string;
}

export interface OrgFallbackRequest {
  org_id: string; org_name: string; status: FallbackStatus;
  requested_at: string | null; decided_at: string | null;
}

/** One row of the "kis ko kab kaunsa mail gaya" audit trail — see
 * notification_service.log_email on the backend. */
export interface EmailLogEntry {
  id: string; to_addr: string; subject: string;
  source: "org" | "platform" | "none";
  status: "sent" | "failed" | "skipped";
  detail: string; created_at: string;
}
export interface PlatformEmailLogEntry extends EmailLogEntry {
  org_id: string; org_name: string;
}

export const triggerLabel: Record<Trigger, string> = {
  before_due: "Before due date",
  on_due: "On due date",
  overdue: "After becoming overdue",
  on_date: "On a specific date",
  weekly: "Weekly",
  monthly: "Monthly",
};

export const weekdayLabel = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]; // index = 0..6, matches backend's days_of_week

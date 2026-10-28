export const templateVars = ["{{learner_name}}", "{{course_title}}", "{{due_date}}", "{{org_name}}", "{{team_name}}", "{{manager_name}}"];

export type Trigger = "before_due" | "on_due" | "overdue" | "weekly_digest";
export type Channel = "email" | "inapp" | "push";

export interface NotifTemplate { id: string; name: string; subject: string; body: string; editable: boolean }
export interface ReminderRule { id: string; trigger: Trigger; days: number; channels: Channel[]; enabled: boolean }

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

export const triggerLabel: Record<Trigger, string> = {
  before_due: "Before due date",
  on_due: "On due date",
  overdue: "After becoming overdue",
  weekly_digest: "Weekly digest",
};

export const templateVars = ["{{learner_name}}", "{{course_title}}", "{{due_date}}", "{{org_name}}", "{{team_name}}", "{{manager_name}}"];

export type Trigger = "before_due" | "on_due" | "overdue" | "weekly_digest";
export type Channel = "email" | "inapp" | "push";

export interface NotifTemplate { id: string; name: string; subject: string; body: string; editable: boolean }
export interface ReminderRule { id: string; trigger: Trigger; days: number; channels: Channel[]; enabled: boolean }
export interface SmtpSettings {
  use_custom: boolean; host: string; port: number; encryption: "TLS" | "SSL" | "None";
  username: string; has_password: boolean; from_name: string; from_email: string;
}

export const triggerLabel: Record<Trigger, string> = {
  before_due: "Before due date",
  on_due: "On due date",
  overdue: "After becoming overdue",
  weekly_digest: "Weekly digest",
};

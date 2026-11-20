"use client";
import { BellRing, Clock, Mail, Plus, Smartphone, Trash2 } from "lucide-react";
import type { ComponentType } from "react";
import { Switch } from "@/components/ui/switch";
import { useCreateRule, useDeleteRule, useRules, useUpdateRule } from "@/lib/hooks/use-notifications";
import { useCourses } from "@/lib/hooks/use-courses";
import {
  CALENDAR_TRIGGERS, triggerLabel, weekdayLabel,
  type Channel, type ReminderRule, type TargetScope, type Trigger,
} from "@/lib/notifications";
import { IconBtn } from "@/components/shell/recognition/ui";

const channelOptions: { id: Channel; label: string; icon: ComponentType<{ size?: number; className?: string }>; disabled?: boolean }[] = [
  { id: "email", label: "Email", icon: Mail },
  { id: "inapp", label: "In-app", icon: BellRing },
  { id: "push", label: "Push", icon: Smartphone, disabled: true },
];

const inputCls = "text-[13px] border border-line rounded-md px-2 py-[5px] bg-surface";

function formatNextFire(iso: string | null | undefined) {
  if (!iso) return null;
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

/** The before_due/on_due/overdue body — unchanged from before the
 * calendar-based rule types existed. */
function DueDateFields({ rule, onChange }: { rule: ReminderRule; onChange: (r: ReminderRule) => void }) {
  if (rule.trigger === "on_due") return null;
  return (
    <>
      <input
        type="number" min={0} value={rule.days} onChange={(e) => onChange({ ...rule, days: Math.max(0, +e.target.value || 0) })}
        className="w-[50px] text-[13px] border border-line rounded-md px-2 py-[5px] text-center"
      />
      <span className="text-[12.5px] text-ink-soft">day{rule.days !== 1 ? "s" : ""}</span>
    </>
  );
}

/** on_date/weekly/monthly's own body — the recurrence shape, who it
 * goes to, and the subject/message actually sent. Kept as one block
 * (rather than three near-identical ones) since weekly/monthly share
 * almost everything except which "every N ___" unit and day-picker
 * they show. */
function CalendarFields({ rule, onChange }: { rule: ReminderRule; onChange: (r: ReminderRule) => void }) {
  const { data: courses = [] } = useCourses();
  const toggleDay = (d: number) => {
    const days = rule.days_of_week ?? [];
    onChange({ ...rule, days_of_week: days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort() });
  };
  const nextFire = formatNextFire(rule.next_fire_at);

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line-soft pt-3">
      {rule.trigger === "on_date" && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12.5px] text-ink-soft">On</span>
          <input
            type="date" value={rule.fire_date ?? ""} onChange={(e) => onChange({ ...rule, fire_date: e.target.value || null })}
            className={inputCls}
          />
          <span className="text-[12.5px] text-ink-soft">at</span>
          <input
            type="time" value={rule.fire_time ?? "09:00"} onChange={(e) => onChange({ ...rule, fire_time: e.target.value })}
            className={inputCls}
          />
        </div>
      )}

      {(rule.trigger === "weekly" || rule.trigger === "monthly") && (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12.5px] text-ink-soft">Every</span>
            <input
              type="number" min={1} max={52} value={rule.interval ?? 1}
              onChange={(e) => onChange({ ...rule, interval: Math.max(1, +e.target.value || 1) })}
              className="w-[50px] text-[13px] border border-line rounded-md px-2 py-[5px] text-center"
            />
            <span className="text-[12.5px] text-ink-soft">{rule.trigger === "weekly" ? "week(s)" : "month(s)"}</span>
            <span className="text-[12.5px] text-ink-soft">at</span>
            <input
              type="time" value={rule.fire_time ?? "09:00"} onChange={(e) => onChange({ ...rule, fire_time: e.target.value })}
              className={inputCls}
            />
          </div>

          {rule.trigger === "weekly" ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[12.5px] text-ink-soft mr-1">On:</span>
              {weekdayLabel.map((label, idx) => {
                const on = (rule.days_of_week ?? []).includes(idx);
                return (
                  <button
                    key={idx} type="button" onClick={() => toggleDay(idx)}
                    className="h-7 w-9 rounded-md text-[11.5px] font-medium"
                    style={{ border: `1px solid ${on ? "var(--color-primary)" : "var(--color-line)"}`, background: on ? "var(--color-primary-soft)" : "transparent", color: on ? "var(--color-primary)" : "var(--color-ink-soft)" }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="text-[12.5px] text-ink-soft">Day of month:</span>
              <input
                type="number" min={1} max={31} value={rule.day_of_month ?? 1}
                onChange={(e) => onChange({ ...rule, day_of_month: Math.min(31, Math.max(1, +e.target.value || 1)) })}
                className="w-[55px] text-[13px] border border-line rounded-md px-2 py-[5px] text-center"
              />
              <span className="text-[11px] text-ink-faint">(clamped to the last day in a shorter month)</span>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-[12.5px] text-ink-soft">Until (optional):</span>
            <input
              type="date" value={rule.end_date ?? ""} onChange={(e) => onChange({ ...rule, end_date: e.target.value || null })}
              className={inputCls}
            />
            {rule.end_date && (
              <button type="button" onClick={() => onChange({ ...rule, end_date: null })} className="text-[11.5px] text-primary">
                Clear
              </button>
            )}
          </div>
        </>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12.5px] text-ink-soft">Send to:</span>
        <select
          value={rule.target_scope ?? "all"}
          onChange={(e) => onChange({ ...rule, target_scope: e.target.value as TargetScope, course_id: e.target.value === "all" ? null : rule.course_id })}
          className={inputCls}
        >
          <option value="all">All users in this org</option>
          <option value="course">Users of a specific course</option>
        </select>
        {rule.target_scope === "course" && (
          <select
            value={rule.course_id ?? ""} onChange={(e) => onChange({ ...rule, course_id: e.target.value || null })}
            className={`${inputCls} min-w-[180px]`}
          >
            <option value="" disabled>Choose a course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <input
          value={rule.subject ?? ""} placeholder="Email subject" onChange={(e) => onChange({ ...rule, subject: e.target.value })}
          className="text-[13px] border border-line rounded-md px-2.5 py-[6px] bg-surface"
        />
        <textarea
          value={rule.message ?? ""} placeholder="Message" rows={2} onChange={(e) => onChange({ ...rule, message: e.target.value })}
          className="text-[13px] border border-line rounded-md px-2.5 py-[6px] bg-surface resize-none"
        />
      </div>

      {nextFire && <p className="text-[11px] text-ink-faint">Next send: {nextFire}</p>}
      {!nextFire && rule.enabled && <p className="text-[11px] text-amber">No upcoming occurrence — check the date/day and "Until" settings.</p>}
    </div>
  );
}

function RuleRow({ rule, onChange, onDelete }: { rule: ReminderRule; onChange: (r: ReminderRule) => void; onDelete: () => void }) {
  const isCalendar = CALENDAR_TRIGGERS.includes(rule.trigger);
  const toggleChannel = (id: Channel) =>
    onChange({ ...rule, channels: rule.channels.includes(id) ? rule.channels.filter((c) => c !== id) : [...rule.channels, id] });
  return (
    <div className="bg-surface border border-line rounded-[10px] p-4" style={{ opacity: rule.enabled ? 1 : 0.6 }}>
      <div className="flex items-center justify-between mb-3 gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Clock size={14} className="text-primary" />
          <select
            value={rule.trigger} onChange={(e) => onChange({ ...rule, trigger: e.target.value as Trigger })}
            className="text-[13px] border border-line rounded-md px-2 py-[5px] font-medium bg-surface"
          >
            {(Object.keys(triggerLabel) as Trigger[]).map((v) => <option key={v} value={v}>{triggerLabel[v]}</option>)}
          </select>
          <DueDateFields rule={rule} onChange={onChange} />
        </div>
        <div className="flex items-center gap-2">
          <Switch checked={rule.enabled} onCheckedChange={(v) => onChange({ ...rule, enabled: v })} />
          <IconBtn icon={Trash2} danger label="Delete rule" onClick={onDelete} />
        </div>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11.5px] text-ink-faint mr-1">Send via:</span>
        {channelOptions.map((c) => {
          const on = rule.channels.includes(c.id);
          return (
            <button
              key={c.id} type="button" disabled={c.disabled} onClick={() => toggleChannel(c.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
              style={{ border: `1px solid ${on ? "var(--color-primary)" : "var(--color-line)"}`, background: on ? "var(--color-primary-soft)" : "transparent", opacity: c.disabled ? 0.4 : 1 }}
            >
              <c.icon size={11} className={on ? "text-primary" : "text-ink-faint"} />
              <span className={`text-[11.5px] ${on ? "text-primary" : "text-ink-soft"}`}>{c.label}{c.disabled ? " (soon)" : ""}</span>
            </button>
          );
        })}
      </div>
      {isCalendar && <CalendarFields rule={rule} onChange={onChange} />}
    </div>
  );
}

export function RulesTab() {
  const { data: rules = [], isLoading } = useRules();
  const update = useUpdateRule();
  const create = useCreateRule();
  const remove = useDeleteRule();
  return (
    <div className="max-w-[640px]">
      <p className="text-[12.5px] text-ink-faint mb-4">
        Control when reminders fire and where they&apos;re delivered — email, in-app, or both.
        Before/on/after-due-date rules apply org-wide to every course with a due date. On a specific
        date, weekly, and monthly rules run on their own schedule and go either to every user in the
        org or to one course&apos;s enrolled learners, whichever you pick below.
      </p>
      <div className="flex flex-col gap-2.5">
        {isLoading && <div className="text-[12.5px] text-ink-faint">Loading…</div>}
        {rules.map((r) => (
          <RuleRow key={r.id} rule={r} onChange={(next) => update.mutate(next)} onDelete={() => remove.mutate(r.id)} />
        ))}
        <div className="flex gap-2 flex-wrap">
          <button
            type="button" disabled={create.isPending}
            onClick={() => create.mutate({ trigger: "before_due", days: 1, channels: ["email"], enabled: true })}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border-[1.5px] border-dashed border-line rounded-[10px] active:opacity-70"
          >
            <Plus size={13} className="text-primary" />
            <span className="text-[12.5px] text-primary font-medium">Add due-date rule</span>
          </button>
          <button
            type="button" disabled={create.isPending}
            onClick={() => create.mutate({
              trigger: "weekly", days: 0, channels: ["email"], enabled: true,
              days_of_week: [0], fire_time: "09:00", interval: 1, target_scope: "all",
              subject: "Reminder", message: "This is a scheduled reminder.",
            })}
            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border-[1.5px] border-dashed border-line rounded-[10px] active:opacity-70"
          >
            <Plus size={13} className="text-primary" />
            <span className="text-[12.5px] text-primary font-medium">Add scheduled reminder</span>
          </button>
        </div>
      </div>
    </div>
  );
}

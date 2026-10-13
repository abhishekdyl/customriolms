"use client";
import { BellRing, Clock, Mail, Plus, Smartphone, Trash2 } from "lucide-react";
import type { ComponentType } from "react";
import { Switch } from "@/components/ui/switch";
import { useCreateRule, useDeleteRule, useRules, useUpdateRule } from "@/lib/hooks/use-notifications";
import { triggerLabel, type Channel, type ReminderRule, type Trigger } from "@/lib/notifications";
import { IconBtn } from "@/components/shell/recognition/ui";

const channelOptions: { id: Channel; label: string; icon: ComponentType<{ size?: number; className?: string }>; disabled?: boolean }[] = [
  { id: "email", label: "Email", icon: Mail },
  { id: "inapp", label: "In-app", icon: BellRing },
  { id: "push", label: "Push", icon: Smartphone, disabled: true },
];

function RuleRow({ rule, onChange, onDelete }: { rule: ReminderRule; onChange: (r: ReminderRule) => void; onDelete: () => void }) {
  const toggle = (id: Channel) =>
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
          {rule.trigger !== "on_due" && (
            <>
              <input
                type="number" min={0} value={rule.days} onChange={(e) => onChange({ ...rule, days: Math.max(0, +e.target.value || 0) })}
                className="w-[50px] text-[13px] border border-line rounded-md px-2 py-[5px] text-center"
              />
              <span className="text-[12.5px] text-ink-soft">day{rule.days !== 1 ? "s" : ""}{rule.trigger === "weekly_digest" ? " apart" : ""}</span>
            </>
          )}
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
              key={c.id} type="button" disabled={c.disabled} onClick={() => toggle(c.id)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full"
              style={{ border: `1px solid ${on ? "var(--color-primary)" : "var(--color-line)"}`, background: on ? "var(--color-primary-soft)" : "transparent", opacity: c.disabled ? 0.4 : 1 }}
            >
              <c.icon size={11} className={on ? "text-primary" : "text-ink-faint"} />
              <span className={`text-[11.5px] ${on ? "text-primary" : "text-ink-soft"}`}>{c.label}{c.disabled ? " (soon)" : ""}</span>
            </button>
          );
        })}
      </div>
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
        Control when reminders fire and where they&apos;re delivered — email, in-app, or both. Rules apply org-wide to every course with a due date.
      </p>
      <div className="flex flex-col gap-2.5">
        {isLoading && <div className="text-[12.5px] text-ink-faint">Loading…</div>}
        {rules.map((r) => (
          <RuleRow key={r.id} rule={r} onChange={(next) => update.mutate(next)} onDelete={() => remove.mutate(r.id)} />
        ))}
        <button
          type="button" disabled={create.isPending}
          onClick={() => create.mutate({ trigger: "before_due", days: 1, channels: ["email"], enabled: true })}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-[1.5px] border-dashed border-line rounded-[10px] active:opacity-70"
        >
          <Plus size={13} className="text-primary" />
          <span className="text-[12.5px] text-primary font-medium">Add reminder rule</span>
        </button>
      </div>
    </div>
  );
}

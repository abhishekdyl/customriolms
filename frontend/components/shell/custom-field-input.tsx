"use client";
import { Input } from "@/components/ui/input";
import type { ProfileField } from "@/lib/types";

/** One form control for an org-defined custom profile field, covering
 * every type the field catalog supports (see
 * backend/app/models/profile_field.py). Shared by every place that
 * collects a user's own or another user's custom field values: the
 * "Create a user" form, the admin "edit profile" dialog, and the
 * self-service "Your profile" page. */
export function CustomFieldInput({
  field, value, onChange,
}: {
  field: ProfileField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.field_type === "textarea") {
    return (
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none"
      />
    );
  }
  if (field.field_type === "checkbox") {
    return (
      <label className="flex items-center gap-2 text-sm text-ink-soft">
        <input type="checkbox" checked={value === "true"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} />
        Yes
      </label>
    );
  }
  if (field.field_type === "radio") {
    return (
      <div className="flex flex-col gap-1.5">
        {field.options.map((opt) => (
          <label key={opt} className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="radio" name={field.shortname} checked={value === opt} onChange={() => onChange(opt)} />
            {opt}
          </label>
        ))}
      </div>
    );
  }
  if (field.field_type === "select") {
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none"
      >
        <option value="">Select…</option>
        {field.options.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    );
  }
  if (field.field_type === "datetime") {
    return <Input type="datetime-local" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return <Input value={value} onChange={(e) => onChange(e.target.value)} />;
}

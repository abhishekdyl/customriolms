"use client";
import { useEffect, useState } from "react";
import { useCourses } from "@/lib/hooks/use-courses";
import { useUsers } from "@/lib/hooks/use-users";
import { useLiveClassProviders } from "@/lib/hooks/use-live-classes";
import type { LiveClass, LiveClassInput, LiveClassProvider, LiveClassTargetScope } from "@/lib/types";

const inputCls = "text-[13px] border border-line rounded-md px-2.5 py-[6px] bg-surface w-full";
const labelCls = "text-[12px] text-ink-soft font-medium mb-1 block";

const providerLabel: Record<LiveClassProvider, string> = { bigbluebutton: "BigBlueButton", zoom: "Zoom" };

/** Local date/time -> an ISO string with the browser's own offset
 * baked in, same round-trip a <input type="datetime-local"> needs
 * since it only ever shows/accepts local wall-clock time. */
function toIso(local: string): string {
  return local ? new Date(local).toISOString() : "";
}
function fromIso(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const emptyForm = (providers: LiveClassProvider[]): LiveClassInput => ({
  title: "", description: "", provider: providers[0] ?? "zoom", scheduled_start: "", duration_minutes: 60,
  target_scope: "all", course_id: null, user_ids: [], recording_url: null,
});

export function LiveClassForm({
  existing, allowAllScope, onSubmit, onCancel, busy, error,
}: {
  existing: LiveClass | null;
  allowAllScope: boolean; // false for a team-scoped instructor — see backend's _enforce_team_scope
  onSubmit: (body: LiveClassInput) => void;
  onCancel: () => void;
  busy?: boolean;
  error?: string | null;
}) {
  const { data: providers = [] } = useLiveClassProviders();
  const { data: courses = [] } = useCourses();
  const { data: users = [] } = useUsers();
  const [form, setForm] = useState<LiveClassInput>(emptyForm(providers));
  const [localStart, setLocalStart] = useState("");
  const [userFilter, setUserFilter] = useState("");

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title, description: existing.description, provider: existing.provider,
        scheduled_start: existing.scheduled_start, duration_minutes: existing.duration_minutes,
        target_scope: existing.target_scope, course_id: existing.course_id, user_ids: existing.user_ids,
        recording_url: existing.recording_url,
      });
      setLocalStart(fromIso(existing.scheduled_start));
    } else {
      setForm(emptyForm(providers));
      setLocalStart("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing, providers.join(",")]);

  const setScope = (scope: LiveClassTargetScope) => {
    setForm((f) => ({
      ...f, target_scope: scope,
      course_id: scope === "course" ? (f.course_id ?? courses[0]?.id ?? null) : null,
      user_ids: scope === "individual" ? f.user_ids : [],
    }));
  };

  const toggleUser = (id: string) => {
    setForm((f) => ({ ...f, user_ids: f.user_ids?.includes(id) ? f.user_ids.filter((u) => u !== id) : [...(f.user_ids ?? []), id] }));
  };

  const filteredUsers = users.filter((u) => `${u.full_name} ${u.email}`.toLowerCase().includes(userFilter.toLowerCase()));

  const canSubmit = form.title.trim() && form.provider && localStart
    && (form.target_scope !== "course" || form.course_id)
    && (form.target_scope !== "individual" || (form.user_ids && form.user_ids.length > 0));

  return (
    <div className="flex flex-col gap-3.5 px-6 py-5 max-h-[70vh] overflow-auto">
      {providers.length === 0 && (
        <p className="text-[12px] text-amber bg-amber-soft rounded-md px-3 py-2">
          No video provider is configured yet — ask a Super Admin to add BigBlueButton or Zoom credentials in Platform Settings first.
        </p>
      )}
      <div>
        <label className={labelCls}>Title</label>
        <input className={inputCls} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Week 4 doubt-clearing session" />
      </div>
      <div>
        <label className={labelCls}>Description (optional)</label>
        <textarea className={inputCls} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      </div>
      <div className="flex gap-3">
        <div className="flex-1">
          <label className={labelCls}>Provider</label>
          <select className={inputCls} value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value as LiveClassProvider })}>
            {providers.length === 0 && <option value={form.provider}>{providerLabel[form.provider]} (not configured)</option>}
            {providers.map((p) => <option key={p} value={p}>{providerLabel[p]}</option>)}
          </select>
        </div>
        <div className="flex-1">
          <label className={labelCls}>Duration (minutes)</label>
          <input type="number" min={5} max={480} className={inputCls} value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: Math.min(480, Math.max(5, +e.target.value || 60)) })} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Starts at</label>
        <input type="datetime-local" className={inputCls} value={localStart}
          onChange={(e) => { setLocalStart(e.target.value); setForm({ ...form, scheduled_start: toIso(e.target.value) }); }} />
      </div>

      <div>
        <label className={labelCls}>Send to</label>
        <select className={inputCls} value={form.target_scope} onChange={(e) => setScope(e.target.value as LiveClassTargetScope)}>
          <option value="all" disabled={!allowAllScope}>All users in this org{!allowAllScope ? " (Org Admin only)" : ""}</option>
          <option value="course" disabled={courses.length === 0}>Users of a specific course{courses.length === 0 ? " (no courses yet)" : ""}</option>
          <option value="individual">A hand-picked list of users</option>
        </select>
      </div>

      {form.target_scope === "course" && (
        <select className={inputCls} value={form.course_id ?? ""} onChange={(e) => setForm({ ...form, course_id: e.target.value || null })}>
          <option value="" disabled>Choose a course…</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      )}

      {form.target_scope === "individual" && (
        <div className="border border-line rounded-md p-2.5 flex flex-col gap-2">
          <input className={inputCls} placeholder="Filter users by name/email…" value={userFilter} onChange={(e) => setUserFilter(e.target.value)} />
          <div className="max-h-[180px] overflow-auto flex flex-col gap-1">
            {filteredUsers.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-[12.5px] py-1 cursor-pointer">
                <input type="checkbox" checked={form.user_ids?.includes(u.id) ?? false} onChange={() => toggleUser(u.id)} />
                <span className="text-ink">{u.full_name}</span>
                <span className="text-ink-faint">{u.email}</span>
              </label>
            ))}
            {filteredUsers.length === 0 && <p className="text-[12px] text-ink-faint px-1">No matching users.</p>}
          </div>
          <p className="text-[11.5px] text-ink-faint">{form.user_ids?.length ?? 0} user(s) selected</p>
        </div>
      )}

      {existing && (
        <div>
          <label className={labelCls}>Recording link (optional, add after the session)</label>
          <input className={inputCls} placeholder="https://…" value={form.recording_url ?? ""} onChange={(e) => setForm({ ...form, recording_url: e.target.value || null })} />
        </div>
      )}

      {error && <p className="text-[12px] text-danger">{error}</p>}

      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} className="px-3.5 py-2 rounded-md text-[12.5px] text-ink-soft">Cancel</button>
        <button
          type="button" disabled={!canSubmit || busy}
          onClick={() => onSubmit(form)}
          className="px-3.5 py-2 rounded-md bg-primary text-white text-[12.5px] font-medium disabled:opacity-50"
        >
          {existing ? "Save changes" : "Schedule class"}
        </button>
      </div>
    </div>
  );
}

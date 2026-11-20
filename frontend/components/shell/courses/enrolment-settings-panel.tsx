"use client";
import { useState } from "react";
import { Info, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useCourses, useUpdateCourse } from "@/lib/hooks/use-courses";
import type { Course } from "@/lib/types";

function rupeesFromPaise(paise: number | null): string {
  return paise == null ? "" : String(paise / 100);
}

function paiseFromRupees(rupees: string): number | null {
  const n = Number(rupees);
  return rupees.trim() === "" || Number.isNaN(n) ? null : Math.round(n * 100);
}

/**
 * Course enrolment methods, on the Participants tab — how a learner ends
 * up enrolled, beyond the always-available manual path (the Assign
 * button right below this, which an Org Admin can use regardless of
 * what's toggled here). Self and paid both default OFF (see backend
 * Course model); turning either on opens a second way in, on top of
 * manual assign, not instead of it.
 */
export function EnrolmentSettingsPanel({ courseId, course }: { courseId: string; course: Course }) {
  const updateCourse = useUpdateCourse(courseId);
  const { data: allCourses = [] } = useCourses();
  const otherCourses = allCourses.filter((c) => c.id !== courseId);

  const [draft, setDraft] = useState<{
    self_enrol_enabled: boolean;
    self_enrol_allowed_countries: string[];
    self_enrol_required_course_id: string;
    paid_enrol_enabled: boolean;
    paid_enrol_price: string;
  } | null>(null);

  const d = draft ?? {
    self_enrol_enabled: course.self_enrol_enabled,
    self_enrol_allowed_countries: course.self_enrol_allowed_countries,
    self_enrol_required_course_id: course.self_enrol_required_course_id ?? "",
    paid_enrol_enabled: course.paid_enrol_enabled,
    paid_enrol_price: rupeesFromPaise(course.paid_enrol_price),
  };
  const dirty = draft !== null;
  const [countryInput, setCountryInput] = useState("");
  const [error, setError] = useState<string | null>(null);

  const addCountry = () => {
    const v = countryInput.trim();
    if (!v || d.self_enrol_allowed_countries.includes(v)) { setCountryInput(""); return; }
    setDraft({ ...d, self_enrol_allowed_countries: [...d.self_enrol_allowed_countries, v] });
    setCountryInput("");
  };
  const removeCountry = (c: string) => setDraft({ ...d, self_enrol_allowed_countries: d.self_enrol_allowed_countries.filter((x) => x !== c) });

  const save = () => {
    setError(null);
    if (d.paid_enrol_enabled && !paiseFromRupees(d.paid_enrol_price)) {
      setError("Set a price before turning paid enrolment on.");
      return;
    }
    updateCourse.mutate(
      {
        self_enrol_enabled: d.self_enrol_enabled,
        self_enrol_allowed_countries: d.self_enrol_allowed_countries,
        self_enrol_required_course_id: d.self_enrol_required_course_id || null,
        paid_enrol_enabled: d.paid_enrol_enabled,
        paid_enrol_price: paiseFromRupees(d.paid_enrol_price),
      },
      { onSuccess: () => setDraft(null), onError: () => setError("Couldn't save — try again.") },
    );
  };

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 text-xs font-medium text-ink-faint">Enrolment methods</p>

      <div className="mb-4 flex items-start gap-2.5 rounded-lg bg-primary-soft px-3 py-2.5">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="text-[11.5px] text-ink-soft">
          <span className="font-medium text-ink">Manual</span> is always available — assign any user or team with the
          button below, regardless of what&apos;s set here. Self and paid enrolment are additional, optional ways in.
        </p>
      </div>

      {/* Self enrolment */}
      <div className="mb-4 rounded-lg border border-line p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12.5px] font-medium text-ink">Self enrolment</p>
            <p className="text-[11px] text-ink-faint">A learner can enrol themselves — an open course, optionally restricted below.</p>
          </div>
          <Switch checked={d.self_enrol_enabled} onCheckedChange={(v) => setDraft({ ...d, self_enrol_enabled: v })} />
        </div>
        {d.self_enrol_enabled && (
          <div className="mt-3 flex flex-col gap-3 border-t border-line-soft pt-3">
            <div>
              <p className="mb-1 text-[10.5px] text-ink-faint">Restrict to countries (optional — blank = anyone)</p>
              <div className="mb-1.5 flex flex-wrap gap-1.5">
                {d.self_enrol_allowed_countries.map((c) => (
                  <span key={c} className="flex items-center gap-1 rounded-full bg-line-soft px-2 py-1 text-[11px] text-ink">
                    {c}
                    <button type="button" onClick={() => removeCountry(c)}><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  value={countryInput} onChange={(e) => setCountryInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCountry(); } }}
                  placeholder="e.g. India" className="h-8 flex-1 rounded-md border border-line bg-paper px-2 text-xs outline-none focus-visible:border-primary"
                />
                <Button size="sm" variant="secondary" onClick={addCountry}>Add</Button>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[10.5px] text-ink-faint">Require a completed course first (optional)</p>
              <select
                value={d.self_enrol_required_course_id}
                onChange={(e) => setDraft({ ...d, self_enrol_required_course_id: e.target.value })}
                className="h-8 w-full rounded-md border border-line bg-paper px-2 text-xs outline-none focus-visible:border-primary"
              >
                <option value="">-- No requirement --</option>
                {otherCourses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Paid enrolment */}
      <div className="mb-1 rounded-lg border border-line p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[12.5px] font-medium text-ink">Paid enrolment</p>
            <p className="text-[11px] text-ink-faint">A learner enrols after paying, via Razorpay Checkout.</p>
          </div>
          <Switch checked={d.paid_enrol_enabled} onCheckedChange={(v) => setDraft({ ...d, paid_enrol_enabled: v })} />
        </div>
        {d.paid_enrol_enabled && (
          <div className="mt-3 border-t border-line-soft pt-3">
            <p className="mb-1 text-[10.5px] text-ink-faint">Price (₹)</p>
            <input
              type="number" min={1} value={d.paid_enrol_price}
              onChange={(e) => setDraft({ ...d, paid_enrol_price: e.target.value })}
              className="h-8 w-40 rounded-md border border-line bg-paper px-2 text-xs outline-none focus-visible:border-primary"
            />
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}

      {dirty && (
        <div className="mt-3 flex items-center gap-2">
          <Button size="sm" disabled={updateCourse.isPending} onClick={save}>{updateCourse.isPending ? "Saving…" : "Save enrolment settings"}</Button>
          <button type="button" className="text-[11.5px] text-ink-faint" onClick={() => { setDraft(null); setError(null); }}>Cancel</button>
        </div>
      )}
    </div>
  );
}

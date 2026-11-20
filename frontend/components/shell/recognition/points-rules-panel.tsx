"use client";
import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { useCourse, useCourses } from "@/lib/hooks/use-courses";
import { useDeletePointRule, usePointRules, useUpsertPointRule, type RuleEvent, type RuleScope } from "@/lib/hooks/use-point-rules";

// Only these activity types persist a "not finished yet, but started"
// state — see learn_service.points_by_user on the backend for why a
// Start rule on anything else can never actually fire.
const START_CAPABLE_TYPES = new Set(["watch", "scorm"]);

export function PointsRulesPanel() {
  const { data: courses = [] } = useCourses();
  const { data: rules = [], isLoading } = usePointRules();
  const upsert = useUpsertPointRule();
  const remove = useDeletePointRule();

  const [scope, setScope] = useState<RuleScope>("course");
  const [courseId, setCourseId] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [event, setEvent] = useState<RuleEvent>("complete");
  const [points, setPoints] = useState("");

  const { data: course } = useCourse(courseId);
  const activities = useMemo(() => course?.modules ?? [], [course]);
  const activity = activities.find((m) => m.id === moduleId);
  const canStart = scope === "module" && activity ? START_CAPABLE_TYPES.has(activity.type) : false;

  const reset = () => { setScope("course"); setCourseId(""); setModuleId(""); setEvent("complete"); setPoints(""); };

  const save = () => {
    const n = Number(points);
    if (!courseId || Number.isNaN(n)) return;
    if (scope === "module" && !moduleId) return;
    upsert.mutate(
      { scope, event: scope === "course" ? "complete" : event, points: n, ...(scope === "course" ? { course_id: courseId } : { module_id: moduleId }) },
      { onSuccess: reset },
    );
  };

  return (
    <div className="mb-5">
      <h3 className="font-head text-[13.5px] text-ink mb-1">Points rules</h3>
      <p className="text-[11.5px] text-ink-faint mb-3">
        Set how many points a specific course (on completion) or a specific activity inside it (on start or completion)
        is worth. Nothing set here falls back to a course/activity's plain completion not earning anything extra —
        add a rule for every course/activity you want on the leaderboard.
      </p>

      <div className="bg-surface border border-line rounded-[10px] p-4 mb-4">
        <div className="grid grid-cols-2 gap-2.5 mb-2.5">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-faint">Scope</span>
            <select value={scope} onChange={(e) => { setScope(e.target.value as RuleScope); setModuleId(""); setEvent("complete"); }} className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper">
              <option value="course">Course</option>
              <option value="module">Activity</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-faint">Course</span>
            <select value={courseId} onChange={(e) => { setCourseId(e.target.value); setModuleId(""); }} className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper">
              <option value="">-- Select --</option>
              {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-faint">Activity</span>
            <select
              value={moduleId} disabled={scope !== "module"}
              onChange={(e) => { setModuleId(e.target.value); setEvent("complete"); }}
              className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper disabled:opacity-50"
            >
              <option value="">-- Select --</option>
              {activities.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-faint">Activity type</span>
            <input readOnly value={activity?.type ?? ""} placeholder="Auto-filled" className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper/60 text-ink-faint" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-faint">Event</span>
            <select
              value={scope === "course" ? "complete" : event} disabled={scope === "course"}
              onChange={(e) => setEvent(e.target.value as RuleEvent)}
              className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper disabled:opacity-50"
            >
              <option value="complete">Complete</option>
              <option value="start" disabled={!canStart}>Start{scope === "module" && moduleId && !canStart ? " (not available for this type)" : ""}</option>
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] text-ink-faint">Points</span>
            <input type="number" min={0} value={points} onChange={(e) => setPoints(e.target.value)} className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper" />
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button" disabled={upsert.isPending || !courseId || points === "" || (scope === "module" && !moduleId)}
            onClick={save}
            className="px-3.5 py-1.5 bg-primary rounded-[5px] text-[12px] text-white font-medium disabled:opacity-60"
          >
            Save changes
          </button>
          <button type="button" onClick={reset} className="px-3.5 py-1.5 text-[12px] text-ink-soft">Cancel</button>
        </div>
      </div>

      <h4 className="font-head text-[12.5px] text-ink mb-2">Existing points rules</h4>
      {isLoading && <div className="text-[12px] text-ink-faint">Loading…</div>}
      <div className="flex flex-col gap-1.5">
        {rules.map((r) => (
          <div key={r.id} className="flex items-center gap-3 border border-line rounded-[8px] px-3 py-2">
            <span className="text-[10.5px] uppercase text-ink-faint w-14 shrink-0">{r.scope}</span>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] text-ink truncate">{r.scope === "course" ? r.course_title : r.module_title}</div>
              <div className="text-[11px] text-ink-faint truncate">{r.course_title}{r.module_type ? ` · ${r.module_type}` : ""} · {r.event}</div>
            </div>
            <span className="font-head text-[13px] text-ink shrink-0">{r.points} pts</span>
            <button type="button" onClick={() => remove.mutate(r.id)} className="text-danger active:opacity-60 shrink-0" title="Delete">
              <Trash2 size={14} />
            </button>
          </div>
        ))}
        {!isLoading && rules.length === 0 && <div className="text-[12px] text-ink-faint">No rules yet.</div>}
      </div>
    </div>
  );
}

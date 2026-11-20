"use client";
import { useState } from "react";
import { Award, ChevronDown, ChevronRight, Settings2, X } from "lucide-react";
import { PageLoader } from "@/components/ui/loading";
import { useTeams } from "@/lib/hooks/use-teams";
import { useMyOrg, useUpdateMyOrg } from "@/lib/hooks/use-orgs";
import { useAdminLeaderboard, useCoursePoints, useModulePoints, useSetCoursePoints, useSetModulePoints } from "@/lib/hooks/use-point-rules";

const medal: Record<number, string> = { 0: "#FFC542", 1: "#C7CBDB", 2: "#E0A672" };

/** One course's own module list, lazily loaded only once its row is
 * expanded — this is where a specific SCORM module (or any other
 * module) gets its own override, independent of its course's. */
function ModuleRows({ courseId }: { courseId: string }) {
  const { data: modules = [], isLoading } = useModulePoints(courseId);
  const setPoints = useSetModulePoints();
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  if (isLoading) return <div className="pl-9 py-2 text-[11.5px] text-ink-faint">Loading modules…</div>;
  if (modules.length === 0) return <div className="pl-9 py-2 text-[11.5px] text-ink-faint">No modules in this course yet.</div>;

  return (
    <div className="pl-9 pr-3 pb-2 flex flex-col gap-1.5">
      {modules.map((m) => {
        const draft = drafts[m.module_id];
        return (
          <div key={m.module_id} className="flex items-center gap-2 py-1">
            <div className="flex-1 min-w-0">
              <div className="text-[12px] text-ink truncate">{m.title}</div>
              <div className="text-[10.5px] text-ink-faint uppercase">{m.type}{m.is_override ? " · custom" : ""}</div>
            </div>
            <input
              type="number" min={0}
              value={draft ?? m.points}
              onChange={(e) => setDrafts((d) => ({ ...d, [m.module_id]: e.target.value }))}
              onBlur={() => {
                if (draft === undefined || draft === "") return;
                const n = Number(draft);
                if (!Number.isNaN(n) && n !== m.points) setPoints.mutate({ moduleId: m.module_id, points: n });
                setDrafts((d) => { const { [m.module_id]: _, ...rest } = d; return rest; });
              }}
              className="w-16 text-[12px] text-right border border-line rounded-md px-2 py-1 bg-paper"
            />
            {m.is_override && (
              <button
                type="button" title="Revert to default"
                onClick={() => setPoints.mutate({ moduleId: m.module_id, points: null })}
                className="text-ink-faint active:opacity-60"
              >
                <X size={13} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function PointsSettingsPanel() {
  const { data: org } = useMyOrg();
  const updateOrg = useUpdateMyOrg();
  const { data: courses = [], isLoading: coursesLoading } = useCoursePoints();
  const setCoursePoints = useSetCoursePoints();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [courseDrafts, setCourseDrafts] = useState<Record<string, string>>({});
  const [defaults, setDefaults] = useState<{ module: string; course: string; quiz: string } | null>(null);

  const d = defaults ?? {
    module: String(org?.default_module_points ?? 10),
    course: String(org?.default_course_points ?? 50),
    quiz: String(org?.default_perfect_quiz_points ?? 20),
  };

  return (
    <div className="mb-4 bg-surface border border-line rounded-[10px] p-4">
      <h3 className="font-head text-[13.5px] text-ink mb-1">Default points</h3>
      <p className="text-[11.5px] text-ink-faint mb-3">
        Applied to every course/module unless it has its own points set below.
      </p>
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-faint">Module complete</span>
          <input type="number" min={0} value={d.module} onChange={(e) => setDefaults({ ...d, module: e.target.value })}
            className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-faint">Course complete</span>
          <input type="number" min={0} value={d.course} onChange={(e) => setDefaults({ ...d, course: e.target.value })}
            className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper" />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] text-ink-faint">Perfect quiz</span>
          <input type="number" min={0} value={d.quiz} onChange={(e) => setDefaults({ ...d, quiz: e.target.value })}
            className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper" />
        </label>
      </div>
      <button
        type="button" disabled={updateOrg.isPending}
        onClick={() => updateOrg.mutate(
          { default_module_points: Number(d.module), default_course_points: Number(d.course), default_perfect_quiz_points: Number(d.quiz) },
          { onSuccess: () => setDefaults(null) },
        )}
        className="px-3.5 py-1.5 bg-primary rounded-[5px] text-[12px] text-white font-medium disabled:opacity-60 mb-4"
      >
        Save defaults
      </button>

      <h3 className="font-head text-[13.5px] text-ink mb-1">Per-course points</h3>
      <p className="text-[11.5px] text-ink-faint mb-3">
        Override what a specific course's certificate is worth, or expand it to set points on one of its own modules
        (e.g. a SCORM package) — leave either blank/default to just use the numbers above.
      </p>
      {coursesLoading && <div className="text-[12px] text-ink-faint">Loading courses…</div>}
      <div className="flex flex-col gap-1.5">
        {courses.map((c) => {
          const draft = courseDrafts[c.course_id];
          const isOpen = expanded === c.course_id;
          return (
            <div key={c.course_id} className="border border-line rounded-[8px] overflow-hidden">
              <div className="flex items-center gap-2 px-2.5 py-2">
                <button type="button" onClick={() => setExpanded(isOpen ? null : c.course_id)} className="text-ink-faint shrink-0">
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <div className="flex-1 min-w-0 text-[12.5px] text-ink truncate">{c.title}</div>
                <input
                  type="number" min={0}
                  value={draft ?? c.points}
                  onChange={(e) => setCourseDrafts((s) => ({ ...s, [c.course_id]: e.target.value }))}
                  onBlur={() => {
                    if (draft === undefined || draft === "") return;
                    const n = Number(draft);
                    if (!Number.isNaN(n) && n !== c.points) setCoursePoints.mutate({ courseId: c.course_id, points: n });
                    setCourseDrafts((s) => { const { [c.course_id]: _, ...rest } = s; return rest; });
                  }}
                  className="w-16 text-[12px] text-right border border-line rounded-md px-2 py-1 bg-paper"
                />
                {c.is_override && (
                  <button
                    type="button" title="Revert to default"
                    onClick={() => setCoursePoints.mutate({ courseId: c.course_id, points: null })}
                    className="text-ink-faint active:opacity-60"
                  >
                    <X size={13} />
                  </button>
                )}
              </div>
              {isOpen && <ModuleRows courseId={c.course_id} />}
            </div>
          );
        })}
        {!coursesLoading && courses.length === 0 && <div className="text-[12px] text-ink-faint">No courses yet.</div>}
      </div>
    </div>
  );
}

export function LeaderboardTab({ query = "" }: { query?: string }) {
  const { data: rows = [], isLoading } = useAdminLeaderboard();
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const [teamFilter, setTeamFilter] = useState("All teams");
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading || teamsLoading) return <PageLoader />;

  const ranked = rows
    .filter((u) => teamFilter === "All teams" || u.team_name === teamFilter)
    .filter((u) => u.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  return (
    <div className="max-w-[560px]">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[12.5px] text-ink-faint max-w-[300px]">
          Ranked by total points — earned from course/module completions and perfect quiz scores, per the points set below.
        </p>
        <div className="flex items-center gap-2 shrink-0">
          <select
            value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
            className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-surface"
          >
            <option>All teams</option>
            {teams.map((t) => <option key={t.id}>{t.name}</option>)}
          </select>
          <button
            type="button" onClick={() => setSettingsOpen((v) => !v)}
            className="flex items-center gap-1.5 text-[12px] text-ink-soft border border-line rounded-md px-2.5 py-1.5 active:opacity-70"
          >
            <Settings2 size={13} /> Points settings
          </button>
        </div>
      </div>

      {settingsOpen && <PointsSettingsPanel />}

      <div className="flex flex-col gap-2">
        {ranked.map((u, i) => (
          <div key={u.id} className="flex items-center gap-3 p-3 bg-surface border border-line rounded-[10px]">
            {i < 3 ? (
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: medal[i] }}>
                <Award size={14} className="text-white" />
              </div>
            ) : (
              <div className="w-7 text-center shrink-0"><span className="font-head text-[13px] text-ink-faint">{i + 1}</span></div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink font-medium">{u.name}</div>
              <div className="text-[11px] text-ink-faint">{u.team_name ?? "No team"}</div>
            </div>
            <span className="font-head text-[14px] text-ink">{u.points.toLocaleString()}</span>
          </div>
        ))}
        {ranked.length === 0 && (
          <div className="p-6 text-center text-[13px] text-ink-faint bg-surface border border-line rounded-[10px]">No learners to rank yet.</div>
        )}
      </div>
    </div>
  );
}

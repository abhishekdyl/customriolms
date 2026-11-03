"use client";
import { CheckCircle2, XCircle } from "lucide-react";
import { useGradebook } from "@/lib/hooks/use-courses";

/** The Moodle-style single weighted/aggregate course grade — one row per
 * enrolled learner, with their weighted grade across every GRADABLE
 * module (a QUIZ always; a SCORM module only when it requires a grade —
 * see Module's "Gradebook weight" field) and a Passed/Not yet badge
 * against the course's pass mark. Separate from ModuleProgressMatrix
 * above it, which shows raw completion per module, not a single graded
 * total. */
export function GradebookTable({ courseId }: { courseId: string }) {
  const { data, isLoading } = useGradebook(courseId);

  return (
    <div className="mb-6 rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-ink-faint">
          Gradebook {data ? `(${data.modules.length} graded module${data.modules.length === 1 ? "" : "s"})` : ""}
        </p>
        {data && <p className="text-[11px] text-ink-faint">Pass mark: {data.pass_mark}%</p>}
      </div>

      {isLoading && <p className="text-xs text-ink-faint">Loading…</p>}
      {!isLoading && (data?.modules.length ?? 0) === 0 && (
        <p className="text-xs text-ink-faint">
          No graded modules yet — add a Quiz module, or turn on &quot;Require a grade&quot; on a SCORM module, to
          start building a weighted course grade here.
        </p>
      )}
      {!isLoading && (data?.modules.length ?? 0) > 0 && (data?.learners.length ?? 0) === 0 && (
        <p className="text-xs text-ink-faint">No one&apos;s enrolled yet.</p>
      )}

      {data && data.modules.length > 0 && data.learners.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="border-b border-line-soft px-2 py-2 text-left text-[11px] font-medium text-ink-faint">Learner</th>
                <th className="border-b border-line-soft px-2 py-2 text-left text-[11px] font-medium text-ink-faint">Graded</th>
                <th className="border-b border-line-soft px-2 py-2 text-left text-[11px] font-medium text-ink-faint">Weighted grade</th>
                <th className="border-b border-line-soft px-2 py-2 text-left text-[11px] font-medium text-ink-faint">Status</th>
              </tr>
            </thead>
            <tbody>
              {data.learners.map((l) => (
                <tr key={l.user_id} className="hover:bg-paper">
                  <td className="border-b border-line-soft px-2 py-2">
                    <div className="truncate text-[12.5px] text-ink">{l.name}</div>
                    <div className="truncate text-[10.5px] text-ink-faint">{l.email}{l.team_name ? ` · ${l.team_name}` : ""}</div>
                  </td>
                  <td className="border-b border-line-soft px-2 py-2 text-[12.5px] text-ink-soft">
                    {l.graded_count} of {l.total_gradable}
                  </td>
                  <td className="border-b border-line-soft px-2 py-2 text-[12.5px] text-ink">
                    {l.weighted_grade === null ? <span className="text-ink-faint">—</span> : `${l.weighted_grade}%`}
                  </td>
                  <td className="border-b border-line-soft px-2 py-2">
                    {l.passed === null ? (
                      <span className="text-[11px] text-ink-faint">Not graded yet</span>
                    ) : l.passed ? (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Passed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-[11px] font-medium text-danger">
                        <XCircle className="h-3.5 w-3.5" /> Below pass mark
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

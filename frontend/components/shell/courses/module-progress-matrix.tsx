"use client";
import { Check } from "lucide-react";
import { useModuleProgress } from "@/lib/hooks/use-courses";
import { cn } from "@/lib/utils";

const TYPE_ICON: Record<string, string> = {
  watch: "🎬", read: "📄", quiz: "❓", manual: "✍️", scorm: "📦",
};

/** Moodle-style "who completed which module" matrix — one row per
 * enrolled learner, one column per module, a checkmark in the cells
 * they've cleared. Lets an Org Admin (or Team Lead, scoped to their own
 * team) see at a glance exactly which modules each learner has — and
 * hasn't — finished, not just a single rolled-up progress %. */
export function ModuleProgressMatrix({ courseId }: { courseId: string }) {
  const { data, isLoading } = useModuleProgress(courseId);

  return (
    <div className="mb-6 rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 text-xs font-medium text-ink-faint">
        Module completion {data ? `(${data.learners.length} learner${data.learners.length === 1 ? "" : "s"})` : ""}
      </p>
      {isLoading && <p className="text-xs text-ink-faint">Loading…</p>}
      {!isLoading && (data?.modules.length ?? 0) === 0 && (
        <p className="text-xs text-ink-faint">Add a module to this course to see completion here.</p>
      )}
      {!isLoading && (data?.learners.length ?? 0) === 0 && (data?.modules.length ?? 0) > 0 && (
        <p className="text-xs text-ink-faint">No one's enrolled yet.</p>
      )}
      {data && data.modules.length > 0 && data.learners.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 min-w-[180px] border-b border-line-soft bg-surface px-2 py-2 text-left text-[11px] font-medium text-ink-faint">
                  Learner
                </th>
                {data.modules.map((m) => (
                  <th
                    key={m.id} title={`${m.title}${m.required ? " (required)" : " (optional)"}`}
                    className="min-w-[72px] max-w-[96px] border-b border-line-soft px-1.5 py-2 text-center text-[10.5px] font-medium text-ink-faint"
                  >
                    <div className="truncate" title={m.title}>{TYPE_ICON[m.type] ?? ""} {m.title}</div>
                  </th>
                ))}
                <th className="min-w-[72px] border-b border-line-soft px-1.5 py-2 text-center text-[10.5px] font-medium text-ink-faint">
                  Course
                </th>
              </tr>
            </thead>
            <tbody>
              {data.learners.map((l) => (
                <tr key={l.user_id} className="hover:bg-paper">
                  <td className="sticky left-0 z-10 border-b border-line-soft bg-surface px-2 py-2">
                    <div className="truncate text-[12.5px] text-ink">{l.name}</div>
                    <div className="truncate text-[10.5px] text-ink-faint">{l.email}{l.team_name ? ` · ${l.team_name}` : ""}</div>
                  </td>
                  {l.cells.map((c) => (
                    <td key={c.module_id} className="border-b border-line-soft px-1.5 py-2 text-center">
                      {c.completed ? (
                        <span
                          title={c.score !== null ? `Completed — ${c.score}%` : "Completed"}
                          className="mx-auto flex h-4 w-4 items-center justify-center rounded bg-success-soft"
                        >
                          <Check className="h-3 w-3 text-success" />
                        </span>
                      ) : (
                        <span className="mx-auto block h-4 w-4 rounded border border-dashed border-line" />
                      )}
                    </td>
                  ))}
                  <td className="border-b border-line-soft px-1.5 py-2 text-center">
                    {l.course_completed ? (
                      <span title="Course completed" className="mx-auto flex h-4 w-4 items-center justify-center rounded bg-primary-soft">
                        <Check className="h-3 w-3 text-primary" />
                      </span>
                    ) : (
                      <span className={cn("mx-auto block h-4 w-4 rounded border border-dashed border-line")} />
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

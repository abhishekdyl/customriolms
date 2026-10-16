"use client";
import { useMemo, useState } from "react";
import { Check } from "lucide-react";
import { useModuleProgress, useQuizAttempts } from "@/lib/hooks/use-courses";
import { cn } from "@/lib/utils";
import { AttemptAnswers } from "@/components/shell/courses/quiz-attempts";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { QuizAttempt } from "@/lib/types";

const TYPE_ICON: Record<string, string> = {
  watch: "🎬", read: "📄", quiz: "❓", manual: "✍️", scorm: "📦",
};

/** Moodle-style "who completed which module" matrix — one row per
 * enrolled learner, one column per module, a checkmark in the cells
 * they've cleared. Lets an Org Admin (or Team Lead, scoped to their own
 * team) see at a glance exactly which modules each learner has — and
 * hasn't — finished, not just a single rolled-up progress %.
 *
 * A completed cell for a module that was actually graded (QUIZ, or a
 * WATCH module with in-video questions — i.e. something with a matching
 * QuizAttempt) is clickable and opens that learner's exact per-question
 * right/wrong breakdown right here, instead of making the admin scroll
 * down to the flat "Quiz & video-question grading" list and hunt for the
 * right row. A plain completion (READ, a WATCH module with no in-video
 * questions, etc.) has nothing to drill into, so it stays a static tick. */
export function ModuleProgressMatrix({ courseId }: { courseId: string }) {
  const { data, isLoading } = useModuleProgress(courseId);
  const { data: attempts } = useQuizAttempts(courseId);
  const [openCell, setOpenCell] = useState<{ userId: string; moduleId: string } | null>(null);

  // Most recent attempt per (user, module) — a retake overwrites which
  // one shows, same "latest counts" logic as the completion itself.
  const latestByCell = useMemo(() => {
    const map = new Map<string, QuizAttempt>();
    for (const a of attempts ?? []) {
      const key = `${a.user_id}|${a.module_id}`;
      const existing = map.get(key);
      if (!existing || new Date(a.created_at) > new Date(existing.created_at)) map.set(key, a);
    }
    return map;
  }, [attempts]);

  const openAttempt = openCell ? latestByCell.get(`${openCell.userId}|${openCell.moduleId}`) : undefined;

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
                  {l.cells.map((c) => {
                    const graded = latestByCell.get(`${l.user_id}|${c.module_id}`);
                    return (
                      <td key={c.module_id} className="border-b border-line-soft px-1.5 py-2 text-center">
                        {c.completed ? (
                          graded ? (
                            <button
                              type="button"
                              onClick={() => setOpenCell({ userId: l.user_id, moduleId: c.module_id })}
                              title={`${graded.score}% — click for the question-by-question breakdown`}
                              className="mx-auto flex h-4 w-4 items-center justify-center rounded bg-success-soft ring-1 ring-success/40 hover:ring-success"
                            >
                              <Check className="h-3 w-3 text-success" />
                            </button>
                          ) : (
                            <span
                              title={c.score !== null ? `Completed — ${c.score}%` : "Completed"}
                              className="mx-auto flex h-4 w-4 items-center justify-center rounded bg-success-soft"
                            >
                              <Check className="h-3 w-3 text-success" />
                            </span>
                          )
                        ) : (
                          <span className="mx-auto block h-4 w-4 rounded border border-dashed border-line" />
                        )}
                      </td>
                    );
                  })}
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

      <Dialog open={!!openCell} onOpenChange={(v) => !v && setOpenCell(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {data?.learners.find((l) => l.user_id === openCell?.userId)?.name} ·{" "}
              {data?.modules.find((m) => m.id === openCell?.moduleId)?.title}
            </DialogTitle>
            {openAttempt && (
              <p className="mt-1 text-xs text-ink-faint">
                {openAttempt.score}%
                {openAttempt.total_points !== null && ` · ${openAttempt.earned_points}/${openAttempt.total_points} marks`} ·{" "}
                <span className={openAttempt.passed ? "text-success" : "text-danger"}>{openAttempt.passed ? "Passed" : "Failed"}</span>
                {" · "}{new Date(openAttempt.created_at).toLocaleString()}
              </p>
            )}
          </DialogHeader>
          <div className="p-4">
            {openAttempt ? <AttemptAnswers answers={openAttempt.answers} /> : <p className="text-xs text-ink-faint">Loading…</p>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

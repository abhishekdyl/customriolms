"use client";
import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { useQuizAttempts } from "@/lib/hooks/use-courses";
import type { QuizAttempt, QuizAttemptAnswer } from "@/lib/types";
import { cn } from "@/lib/utils";

/** The per-question right/wrong breakdown of one attempt — what the
 * learner answered vs. the correct answer, for every question on that
 * submission. Shared between the flat attempt list below and the
 * per-cell popup on ModuleProgressMatrix, so both read grading the same
 * way from the same snapshot data. */
export function AttemptAnswers({ answers }: { answers: QuizAttemptAnswer[] }) {
  return (
    <div className="flex flex-col gap-2">
      {answers.map((a, i) => (
        <div key={a.question_id} className="rounded-md bg-surface border border-line-soft p-2.5">
          <div className="flex items-start gap-2">
            {a.correct ? (
              <Check className="h-3.5 w-3.5 text-success shrink-0 mt-0.5" />
            ) : (
              <X className="h-3.5 w-3.5 text-danger shrink-0 mt-0.5" />
            )}
            <p className="text-[12.5px] text-ink">{i + 1}. {a.question_text ?? "(image question)"}</p>
          </div>
          <div className="ml-5 mt-1 flex flex-col gap-0.5">
            <p className="text-[11.5px] text-ink-faint">
              Answered: <span className={a.correct ? "text-ink" : "text-danger"}>{a.picked_option_text ?? a.picked_text ?? "— no answer —"}</span>
            </p>
            {!a.correct && (
              <p className="text-[11.5px] text-ink-faint">
                Correct answer: <span className="text-success">{a.correct_option_text ?? a.accepted_answers.join(" / ") ?? "—"}</span>
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AttemptRow({ attempt }: { attempt: QuizAttempt }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-line-soft last:border-0">
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 py-2.5 text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown className="h-3.5 w-3.5 text-ink-faint shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 text-ink-faint shrink-0" />}
          <div className="min-w-0">
            <p className="truncate text-sm text-ink">{attempt.user_name}</p>
            <p className="truncate text-[11px] text-ink-faint">
              {attempt.module_title} · {new Date(attempt.created_at).toLocaleString()}
            </p>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <span className="text-xs text-ink-soft">{attempt.score}%</span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px]",
              attempt.passed ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {attempt.passed ? "Passed" : "Failed"}
          </span>
        </div>
      </button>
      {open && <div className="mb-3">{<AttemptAnswers answers={attempt.answers} />}</div>}
    </div>
  );
}

/** Every quiz/in-video-question submission on this course, pass or fail,
 * with a per-question breakdown of exactly what each learner answered —
 * the Moodle-style "quiz submissions" review an Org Admin / Team Lead
 * needs, since a learner's own pass/fail screen doesn't show this to
 * anyone else. Covers QUIZ modules and WATCH modules' in-video questions
 * alike (both write a QuizAttempt row — see learn_service.py). The
 * module filter below is what makes this "course ke mode wise question
 * ke grade" instead of one long mixed list. */
export function QuizAttemptsSection({ courseId }: { courseId: string }) {
  const { data: attempts, isLoading } = useQuizAttempts(courseId);
  const [moduleFilter, setModuleFilter] = useState<string>("all");

  // Module titles present in the data, in first-seen (= newest-attempt)
  // order — good enough for a short dropdown without a separate modules
  // fetch just for this.
  const moduleOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of attempts ?? []) seen.set(a.module_id, a.module_title);
    return Array.from(seen.entries());
  }, [attempts]);

  const filtered = useMemo(
    () => (moduleFilter === "all" ? attempts ?? [] : (attempts ?? []).filter((a) => a.module_id === moduleFilter)),
    [attempts, moduleFilter],
  );

  return (
    <div className="mb-6 rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs font-medium text-ink-faint">
          Quiz &amp; video-question grading {attempts ? `(${filtered.length}${moduleFilter === "all" ? "" : ` of ${attempts.length}`})` : ""}
        </p>
        {moduleOptions.length > 1 && (
          <select
            value={moduleFilter} onChange={(e) => setModuleFilter(e.target.value)}
            className="h-7 rounded-md border border-line px-1.5 text-[11px]"
          >
            <option value="all">All modules</option>
            {moduleOptions.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
          </select>
        )}
      </div>
      {isLoading && <p className="text-xs text-ink-faint">Loading…</p>}
      {!isLoading && (attempts?.length ?? 0) === 0 && (
        <p className="text-xs text-ink-faint">No quiz or in-video question has been submitted on this course yet.</p>
      )}
      {!isLoading && (attempts?.length ?? 0) > 0 && filtered.length === 0 && (
        <p className="text-xs text-ink-faint">No submissions for this module yet.</p>
      )}
      {filtered.length > 0 && (
        <div className="flex flex-col">
          {filtered.map((a) => <AttemptRow key={a.id} attempt={a} />)}
        </div>
      )}
    </div>
  );
}

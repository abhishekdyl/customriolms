"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, BookOpen, CheckCircle2, Circle, HelpCircle, Loader2, PlayCircle, Sparkles, XCircle,
} from "lucide-react";
import { useCompleteModule, useMyCourse, useSubmitQuiz } from "@/lib/hooks/use-my-courses";
import { MODULE_TYPE_LABEL } from "@/lib/learner-courses";
import { cn } from "@/lib/utils";
import { ScormPlayer } from "@/components/shell/courses/scorm-player";
import type { LearnerModule, QuizResult } from "@/lib/types";

const TABS = [
  { id: "content", label: "Modules", icon: BookOpen },
  { id: "summary", label: "AI summary", icon: Sparkles },
  { id: "quiz", label: "Quiz", icon: HelpCircle },
] as const;
type TabId = (typeof TABS)[number]["id"];

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/learn/courses" className="flex items-center gap-1.5">
      <ArrowLeft size={14} color="var(--color-ink-soft)" />
      <span className="text-[12.5px] text-ink-soft">{label}</span>
    </Link>
  );
}

/** Row for a non-quiz module — shows a "Mark complete" button until done.
 * A SCORM module is the exception: its own package decides when it's
 * done (via the JS API shim), so instead of a button it expands into
 * the actual player right in the list. */
function ModuleRow({ module: m, courseId }: { module: LearnerModule; courseId: string }) {
  const complete = useCompleteModule(courseId);

  if (m.type === "scorm") {
    return (
      <div className="border-b border-line-soft py-3">
        <div className="mb-2 flex items-center gap-3">
          {m.completed ? (
            <CheckCircle2 size={18} color="var(--color-success)" />
          ) : (
            <Circle size={18} color="var(--color-ink-faint)" />
          )}
          <div className="flex-1">
            <div className="text-[13.5px] text-ink">{m.title}</div>
            <div className="text-[11px] text-ink-faint">
              {MODULE_TYPE_LABEL[m.type]}
              {m.skill_count > 0 && ` · builds ${m.skill_count} skill${m.skill_count > 1 ? "s" : ""}`}
            </div>
          </div>
        </div>
        {m.scorm_launch_path ? (
          <ScormPlayer
            courseId={courseId} moduleId={m.id} launchPath={m.scorm_launch_path} version={m.scorm_version}
            completed={m.completed} onComplete={() => complete.mutate(m.id)}
          />
        ) : (
          <div className="text-[12.5px] text-ink-faint">This module's SCORM package isn't ready yet.</div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 border-b border-line-soft py-3">
      {m.completed ? (
        <CheckCircle2 size={18} color="var(--color-success)" />
      ) : (
        <Circle size={18} color="var(--color-ink-faint)" />
      )}
      <div className="flex-1">
        <div className="text-[13.5px] text-ink">{m.title}</div>
        <div className="text-[11px] text-ink-faint">
          {MODULE_TYPE_LABEL[m.type]}
          {m.skill_count > 0 && ` · builds ${m.skill_count} skill${m.skill_count > 1 ? "s" : ""}`}
        </div>
        {complete.isError && (
          <div className="mt-1 text-[11px] text-danger">
            {(complete.error as Error)?.message || "Couldn't mark this complete. Try again."}
          </div>
        )}
      </div>
      {m.type !== "quiz" &&
        (m.completed ? (
          <span className="text-[11.5px] font-medium text-success">Completed</span>
        ) : (
          <button
            onClick={() => complete.mutate(m.id)}
            disabled={complete.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-60"
          >
            {complete.isPending && <Loader2 size={12} className="animate-spin" />}
            Mark complete
          </button>
        ))}
    </div>
  );
}

/** Interactive quiz — radio answers per question, scored server-side on submit. */
function QuizPanel({ module: quizModule, courseId }: { module: LearnerModule; courseId: string }) {
  const submit = useSubmitQuiz(courseId);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<QuizResult | null>(null);

  if (quizModule.completed && !result) {
    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="font-head text-[15px] text-ink">{quizModule.title}</div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-3">
          <CheckCircle2 size={14} color="var(--color-success)" />
          <span className="text-[12.5px] text-ink">You've already passed this quiz.</span>
        </div>
      </div>
    );
  }

  const allAnswered = quizModule.questions.every((q) => answers[q.id] !== undefined);

  function handleSubmit() {
    const ordered = quizModule.questions.map((q) => answers[q.id] ?? -1);
    submit.mutate(
      { moduleId: quizModule.id, answers: ordered },
      { onSuccess: (data) => setResult(data) }
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="font-head text-[15px] text-ink">{quizModule.title}</div>
      <div className="mt-1 text-[12.5px] text-ink-soft">
        {quizModule.questions.length} question{quizModule.questions.length > 1 ? "s" : ""} · pass mark{" "}
        {quizModule.threshold}%
      </div>

      {result ? (
        <div className="mt-3 flex flex-col gap-3">
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-3 py-3",
              result.passed ? "bg-success-soft" : "bg-danger-soft"
            )}
          >
            {result.passed ? (
              <CheckCircle2 size={14} color="var(--color-success)" />
            ) : (
              <XCircle size={14} color="var(--color-danger)" />
            )}
            <span className="text-[12.5px] text-ink">
              Scored {result.score}% ({result.passed ? "passed" : `needed ${result.threshold}%`})
              {result.course_completed && " · course completed 🎉"}
            </span>
          </div>
          {!result.passed && (
            <button
              onClick={() => setResult(null)}
              className="self-start rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink"
            >
              Retake
            </button>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {quizModule.questions.map((q, qi) => (
            <div key={q.id}>
              <div className="text-[13px] text-ink">
                {qi + 1}. {q.text}
              </div>
              <div className="mt-1.5 flex flex-col gap-1">
                {q.options.map((opt, oi) => (
                  <label key={oi} className="flex items-center gap-2 py-0.5">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === oi}
                      onChange={() => setAnswers((a) => ({ ...a, [q.id]: oi }))}
                    />
                    <span className="text-[12.5px] text-ink-soft">{opt}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}

          {submit.isError && (
            <div className="text-[12px] text-danger">
              {(submit.error as Error)?.message || "Couldn't submit the quiz. Try again."}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={!allAnswered || submit.isPending}
            className="flex items-center justify-center gap-1.5 self-start rounded-lg bg-primary px-4 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
          >
            {submit.isPending && <Loader2 size={12} className="animate-spin" />}
            Submit quiz
          </button>
        </div>
      )}
    </div>
  );
}

export default function CourseViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: course, isLoading, isError } = useMyCourse(id);
  const [tab, setTab] = useState<TabId>("content");

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-3 md:px-0">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-line-soft" />
        <div className="h-[190px] animate-pulse rounded-lg bg-line-soft" />
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-3 md:px-0">
        <BackLink label="My Courses" />
        <p className="mt-6 text-[13px] text-ink-faint">
          This course couldn’t be found, or it hasn’t been assigned to you.
        </p>
      </div>
    );
  }

  const mods = course.modules;
  const quizModule = mods.find((m) => m.type === "quiz" && m.questions.length > 0);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1080px] flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 py-3 md:px-0">
        <BackLink label={course.title} />
      </div>

      <div className="flex-1 px-4 pb-6 md:px-0">
        {/* video area — static placeholder, same as the prototype, until content playback is wired */}
        <div className="mb-3 flex h-[190px] items-center justify-center rounded-lg bg-ink">
          <PlayCircle size={40} color="rgba(255,255,255,0.6)" />
        </div>

        <div className="flex border-b border-line-soft">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5",
                tab === t.id ? "border-primary" : "border-transparent"
              )}
            >
              <t.icon size={13} color={tab === t.id ? "var(--color-primary)" : "var(--color-ink-faint)"} />
              <span className={cn("text-xs", tab === t.id ? "text-ink" : "text-ink-faint")}>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="py-4">
          {tab === "content" && (
            <div className="flex flex-col gap-0.5">
              {mods.map((m) => (
                <ModuleRow key={m.id} module={m} courseId={course.id} />
              ))}
              {mods.length === 0 && (
                <div className="text-[13px] text-ink-faint">No modules published for this course yet.</div>
              )}
            </div>
          )}

          {tab === "summary" && (
            <div className="flex items-center gap-2 rounded-lg bg-primary-soft px-4 py-6">
              <Sparkles size={14} color="var(--color-primary)" />
              <span className="text-[12.5px] text-ink">
                AI summary generates once you’ve watched this module’s content.
              </span>
            </div>
          )}

          {tab === "quiz" &&
            (quizModule ? (
              <QuizPanel module={quizModule} courseId={course.id} />
            ) : (
              <div className="text-[13px] text-ink-faint">No quiz on this course yet.</div>
            ))}
        </div>
      </div>
    </div>
  );
}

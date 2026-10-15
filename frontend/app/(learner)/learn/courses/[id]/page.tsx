"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, BookOpen, CheckCircle2, Circle, HelpCircle, Loader2, Lock, PlayCircle, Sparkles, XCircle,
} from "lucide-react";
import { useCompleteModule, useMyCourse, useSubmitQuiz } from "@/lib/hooks/use-my-courses";
import { MODULE_TYPE_LABEL } from "@/lib/learner-courses";
import { cn } from "@/lib/utils";
import { ScormPlayer } from "@/components/shell/courses/scorm-player";
import type { LearnerModule, QuizAnswer, QuizResult } from "@/lib/types";

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

/** A WATCH module's inline video — tracks the furthest point the learner
 * has actually reached (not just where the scrubber currently sits, so
 * jumping straight to the end can't fake a full watch-through) and only
 * lets "Mark complete" fire once that reaches the module's threshold.
 * The backend re-checks this anyway (learn_service.complete_module) —
 * this is just what keeps the button honestly disabled until then. */
function WatchPlayer({ module: m, courseId }: { module: LearnerModule; courseId: string }) {
  const complete = useCompleteModule(courseId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [watchedPct, setWatchedPct] = useState(m.score ?? 0);

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const pct = Math.round((v.currentTime / v.duration) * 100);
    setWatchedPct((prev) => Math.max(prev, pct));
  };

  const needsMore = watchedPct < m.threshold;

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
        {m.completed && <span className="text-[11.5px] font-medium text-success">Completed</span>}
      </div>

      {m.file_url ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video
          ref={videoRef} src={m.file_url} controls onTimeUpdate={onTimeUpdate}
          className="mb-2 max-h-[280px] w-full rounded-lg bg-ink"
        />
      ) : (
        <div className="mb-2 flex h-[140px] items-center justify-center rounded-lg bg-ink">
          <PlayCircle size={32} color="rgba(255,255,255,0.5)" />
        </div>
      )}

      {!m.completed && (
        <>
          <div className="mb-1.5 text-[11.5px] text-ink-faint">
            Watched {watchedPct}% · need {m.threshold}% to mark this complete
          </div>
          {complete.isError && (
            <div className="mb-1.5 text-[11px] text-danger">
              {(complete.error as Error)?.message || "Couldn't mark this complete. Try again."}
            </div>
          )}
          <button
            onClick={() => complete.mutate({ moduleId: m.id, watched_pct: watchedPct })}
            disabled={needsMore || complete.isPending}
            title={needsMore ? `Keep watching — ${m.threshold - watchedPct}% to go` : undefined}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
          >
            {complete.isPending && <Loader2 size={12} className="animate-spin" />}
            Mark complete
          </button>
        </>
      )}
    </div>
  );
}

/** A module the course's "lock modules in order" setting hasn't unlocked
 * yet — no player, no quiz, no "mark complete", just what it is and what
 * finishing first. The backend already strips file_url/questions for a
 * locked module, so there's nothing to render even if this didn't exist;
 * this is purely the honest, greyed-out explanation of why. */
function LockedRow({ module: m, previousTitle }: { module: LearnerModule; previousTitle: string | null }) {
  return (
    <div className="flex items-center gap-3 border-b border-line-soft py-3 opacity-50">
      <Lock size={18} color="var(--color-ink-faint)" />
      <div className="flex-1">
        <div className="text-[13.5px] text-ink-faint">{m.title}</div>
        <div className="text-[11px] text-ink-faint">
          {MODULE_TYPE_LABEL[m.type]} · {previousTitle ? `Finish "${previousTitle}" first to unlock this` : "Locked"}
        </div>
      </div>
    </div>
  );
}

/** Row for a non-quiz module — shows a "Mark complete" button until done.
 * WATCH and SCORM are the exceptions: a WATCH module expands into a real
 * player with watch-% tracking (WatchPlayer, above), and a SCORM module's
 * own package decides when it's done (via the JS API shim), so both show
 * the actual player inline instead of a bare button. */
function ModuleRow({ module: m, courseId, previousTitle }: { module: LearnerModule; courseId: string; previousTitle: string | null }) {
  const complete = useCompleteModule(courseId);

  if (m.locked) {
    return <LockedRow module={m} previousTitle={previousTitle} />;
  }

  if (m.type === "watch") {
    return <WatchPlayer module={m} courseId={courseId} />;
  }

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
            completed={m.completed} onComplete={() => complete.mutate({ moduleId: m.id })}
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
            onClick={() => complete.mutate({ moduleId: m.id })}
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
// One question's working answer — option_id for MCQ/TRUE_FALSE, text for
// SHORT_ANSWER (mirrors QuizAnswer, see lib/types.ts).
type Answer = { option_id?: string; text?: string };

function QuizPanel({ module: quizModule, courseId }: { module: LearnerModule; courseId: string }) {
  const submit = useSubmitQuiz(courseId);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
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

  const isAnswered = (q: LearnerModule["questions"][number]) => {
    const a = answers[q.id];
    if (!a) return false;
    return q.type === "short_answer" ? !!(a.text ?? "").trim() : !!a.option_id;
  };
  const allAnswered = quizModule.questions.every(isAnswered);

  function handleSubmit() {
    const payload: QuizAnswer[] = quizModule.questions.map((q) => ({
      question_id: q.id,
      option_id: answers[q.id]?.option_id ?? null,
      text: answers[q.id]?.text ?? null,
    }));
    submit.mutate(
      { moduleId: quizModule.id, answers: payload },
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
          <div className="flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2">
            <CheckCircle2 size={13} color="var(--color-primary)" />
            <span className="text-[11.5px] text-ink">Your answers were submitted and recorded.</span>
          </div>
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
              Scored {result.score}% ({result.passed ? "passed" : `needed ${result.threshold}% to pass`})
              {result.course_completed && " · course completed 🎉"}
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {quizModule.questions.map((q, qi) => {
              const r = result.results.find((x) => x.question_id === q.id);
              return (
                <div key={q.id} className="flex items-start gap-2 rounded-lg border border-line-soft p-2.5">
                  {r?.correct ? (
                    <CheckCircle2 size={13} color="var(--color-success)" className="mt-0.5 shrink-0" />
                  ) : (
                    <XCircle size={13} color="var(--color-danger)" className="mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="text-[12.5px] text-ink">{qi + 1}. {q.text ?? "(image question)"}</p>
                    {!r?.correct && (
                      <p className="mt-0.5 text-[11.5px] text-danger">That wasn't correct — recorded as submitted either way.</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {!result.passed && (
            <button
              onClick={() => setResult(null)}
              className="self-start rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink"
            >
              Retake to try for a passing score
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
              {q.image_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={q.image_url} alt="" className="mt-1.5 max-h-40 rounded-lg border border-line-soft object-contain" />
              )}

              {q.type === "short_answer" ? (
                <input
                  value={answers[q.id]?.text ?? ""}
                  onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: { text: e.target.value } }))}
                  placeholder="Your answer"
                  className="mt-1.5 w-full rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] outline-none"
                />
              ) : (
                <div className="mt-1.5 flex flex-col gap-1">
                  {q.options.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 py-0.5">
                      <input
                        type="radio"
                        name={q.id}
                        checked={answers[q.id]?.option_id === opt.id}
                        onChange={() => setAnswers((a) => ({ ...a, [q.id]: { option_id: opt.id } }))}
                      />
                      {opt.image_url && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={opt.image_url} alt="" className="h-10 w-10 flex-shrink-0 rounded-md border border-line-soft object-cover" />
                      )}
                      {opt.text && <span className="text-[12.5px] text-ink-soft">{opt.text}</span>}
                    </label>
                  ))}
                </div>
              )}
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
              {mods.map((m, i) => (
                <ModuleRow key={m.id} module={m} courseId={course.id} previousTitle={i > 0 ? mods[i - 1].title : null} />
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
              quizModule.locked ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-6">
                  <Lock size={14} color="var(--color-ink-faint)" />
                  <span className="text-[12.5px] text-ink-faint">
                    {(() => {
                      const qi = mods.findIndex((m) => m.id === quizModule.id);
                      const prev = qi > 0 ? mods[qi - 1].title : null;
                      return prev ? `Finish "${prev}" first to unlock this quiz.` : "This quiz is locked.";
                    })()}
                  </span>
                </div>
              ) : (
                <QuizPanel module={quizModule} courseId={course.id} />
              )
            ) : (
              <div className="text-[13px] text-ink-faint">No quiz on this course yet.</div>
            ))}
        </div>
      </div>
    </div>
  );
}

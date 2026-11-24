"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft, BookOpen, CheckCircle2, Circle, Clock, HelpCircle, Loader2, Lock, PlayCircle, RotateCcw, Sparkles, Star, XCircle,
} from "lucide-react";
import { Video, VideoPlayer, VideoSkin } from "@videojs/react/video";
import {
  useCheckpointScormProgress, useCheckpointWatchProgress, useCompleteModule, usePreviewCourse, useResetCoursePreview,
  useRetakeScormModule, useRetakeWatchModule, useSubmitQuiz,
} from "@/lib/hooks/use-course-preview";
import { CourseReviewsPanel } from "@/components/learner/course-rating";
import { MODULE_TYPE_LABEL } from "@/lib/learner-courses";
import { cn } from "@/lib/utils";
import { ScormPlayer } from "@/components/shell/courses/scorm-player";
import type { CompleteResult, LearnerModule, QuizAnswer, QuizResult } from "@/lib/types";

// This page is a deliberate near-exact mirror of the learner-facing
// (learner)/learn/courses/[id]/page.tsx — same module rendering, same
// video/quiz/SCORM components, same Reviews tab (CourseReviewsPanel) —
// just reading/writing progress through the /preview endpoints
// (use-course-preview.ts) instead of /mine, so an Org Admin / course
// teacher gets the EXACT learner flow (locks, completion checkmarks,
// retake gates, certificates, and now leaving a rating too) without
// being enrolled. Submitting a rating here goes through the real
// /ratings endpoint directly (not a /preview one) — course_rating_
// service.is_enrolled treats an Org Admin and this course's own
// Teacher(s) as eligible, so their rating counts toward the course's
// real public average same as a real learner's; see that service's
// docstring. The one real difference from the learner page is a
// "Reset my progress" action up top so it can be walked through again
// from module 1 as many times as needed while testing.

// One question's working answer while it's on screen — same shape as the
// quiz panel's own Answer below, kept local to each component since they
// never share state.
type InVideoAnswer = { option_id?: string; text?: string };

/** The in-video question overlay a WatchPlayer shows when playback
 * reaches a question's trigger_time_sec — pauses the video underneath,
 * runs an optional countdown (timer_seconds), and calls onResolve once
 * with either a real answer or `null` (timed out with nothing picked —
 * a skip, never scored as wrong, see QuizAnswerIn's docstring on the
 * backend). onResolve is also how the parent resumes playback. */
function InVideoQuestionOverlay({
  question: q, onResolve,
}: { question: LearnerModule["questions"][number]; onResolve: (answer: InVideoAnswer | null) => void }) {
  const [answer, setAnswer] = useState<InVideoAnswer>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(q.timer_seconds);
  const resolvedRef = useRef(false);

  const resolve = (a: InVideoAnswer | null) => {
    if (resolvedRef.current) return;
    resolvedRef.current = true;
    onResolve(a);
  };

  useEffect(() => {
    if (q.timer_seconds == null) return;
    const interval = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev === null) return prev;
        if (prev <= 1) {
          clearInterval(interval);
          setAnswer((current) => {
            const hasPick = current.option_id || (current.text ?? "").trim();
            resolve(hasPick ? current : null);
            return current;
          });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.id]);

  const isShortAnswer = q.type === "short_answer";
  const canSubmit = isShortAnswer ? !!(answer.text ?? "").trim() : !!answer.option_id;

  return (
    <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-ink/80 p-4">
      <div className="w-full max-w-sm rounded-lg bg-paper p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-[11px] font-medium text-ink-soft">Question</span>
          {timeLeft !== null && (
            <span className="flex items-center gap-1 text-[11px] font-medium text-amber">
              <Clock size={12} /> {timeLeft}s
            </span>
          )}
        </div>
        <p className="text-[13px] text-ink">{q.text}</p>

        {isShortAnswer ? (
          <input
            autoFocus
            value={answer.text ?? ""}
            onChange={(e) => setAnswer({ text: e.target.value })}
            placeholder="Your answer (in English)"
            className="mt-2 w-full rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] outline-none"
          />
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {q.options.map((opt) => (
              <label key={opt.id} className="flex items-center gap-2 rounded-md py-0.5">
                <input
                  type="radio" name={`iv-${q.id}`}
                  checked={answer.option_id === opt.id}
                  onChange={() => setAnswer({ option_id: opt.id })}
                />
                <span className="text-[12.5px] text-ink-soft">{opt.text}</span>
              </label>
            ))}
          </div>
        )}

        <button
          onClick={() => resolve(canSubmit ? answer : null)}
          disabled={!canSubmit}
          className="mt-3 w-full rounded-lg bg-primary py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
        >
          Submit answer
        </button>
      </div>
    </div>
  );
}

const TABS = [
  { id: "content", label: "Modules", icon: BookOpen },
  { id: "summary", label: "AI summary", icon: Sparkles },
  { id: "quiz", label: "Quiz", icon: HelpCircle },
  { id: "reviews", label: "Reviews", icon: Star },
] as const;
type TabId = (typeof TABS)[number]["id"];

function BackLink({ label }: { label: string }) {
  const { org, id } = useParams<{ org: string; id: string }>();
  return (
    <Link href={`/${org}/courses/${id}`} className="flex items-center gap-1.5">
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
  const checkpoint = useCheckpointWatchProgress(courseId);
  const retake = useRetakeWatchModule(courseId);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [watchedPct, setWatchedPct] = useState(Math.max(m.score ?? 0, m.watch_furthest_pct));

  const inVideoQuestions = [...m.questions]
    .filter((q) => q.trigger_time_sec !== null)
    .sort((a, b) => (a.trigger_time_sec ?? 0) - (b.trigger_time_sec ?? 0));
  const [activeQuestion, setActiveQuestion] = useState<LearnerModule["questions"][number] | null>(null);
  const [shownIds, setShownIds] = useState<Set<string>>(new Set(m.watch_answered_question_ids));
  const [collectedAnswers, setCollectedAnswers] = useState<Record<string, InVideoAnswer>>({});
  const [completeResult, setCompleteResult] = useState<CompleteResult | null>(null);
  const [retaking, setRetaking] = useState(false);
  const maxReachedRef = useRef(0);
  const seekedOnLoadRef = useRef(false);
  const lastCheckpointedPctRef = useRef(m.watch_furthest_pct);

  const onLoadedMetadata = () => {
    const v = videoRef.current;
    if (!v || !v.duration || seekedOnLoadRef.current) return;
    seekedOnLoadRef.current = true;
    if (m.watch_furthest_pct > 0) {
      const seconds = (m.watch_furthest_pct / 100) * v.duration;
      v.currentTime = seconds;
      maxReachedRef.current = seconds;
    }
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (!v || !v.duration) return;
    const pct = Math.round((v.currentTime / v.duration) * 100);
    setWatchedPct((prev) => Math.max(prev, pct));
    maxReachedRef.current = Math.max(maxReachedRef.current, v.currentTime);

    if (pct - lastCheckpointedPctRef.current >= 5 || pct >= 100) {
      lastCheckpointedPctRef.current = pct;
      checkpoint.mutate({ moduleId: m.id, watched_pct: pct });
    }

    if (!activeQuestion) {
      const due = inVideoQuestions.find((q) => !shownIds.has(q.id) && (q.trigger_time_sec ?? 0) <= v.currentTime);
      if (due) {
        v.pause();
        setActiveQuestion(due);
      }
    }
  };

  const onSeeking = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.currentTime > maxReachedRef.current + 0.75) {
      v.currentTime = maxReachedRef.current;
    }
  };

  const onPlay = () => {
    if (activeQuestion) videoRef.current?.pause();
  };

  const resolveActiveQuestion = (answer: InVideoAnswer | null) => {
    if (!activeQuestion) return;
    if (answer) {
      setCollectedAnswers((prev) => ({ ...prev, [activeQuestion.id]: answer }));
      checkpoint.mutate({
        moduleId: m.id,
        answer: { question_id: activeQuestion.id, option_id: answer.option_id ?? null, text: answer.text ?? null },
      });
    }
    setShownIds((prev) => new Set(prev).add(activeQuestion.id));
    setActiveQuestion(null);
    videoRef.current?.play();
  };

  const needsMore = watchedPct < m.threshold;
  const hasQuestions = inVideoQuestions.length > 0;
  const allAnsweredAlready = hasQuestions && inVideoQuestions.every((q) => shownIds.has(q.id));
  const limit = m.retake_enabled ? m.retake_limit : 1;
  const canRetake = hasQuestions && (limit === null || m.attempts_used < limit);
  const showRetakeGate = hasQuestions && allAnsweredAlready && m.attempts_used > 0 && !completeResult;
  const showMarkComplete = (!m.completed || retaking) && !showRetakeGate;

  const handleComplete = () => {
    const answers: QuizAnswer[] = Object.entries(collectedAnswers).map(([question_id, a]) => ({
      question_id, option_id: a.option_id ?? null, text: a.text ?? null,
    }));
    complete.mutate(
      { moduleId: m.id, watched_pct: watchedPct, answers },
      { onSuccess: (data) => setCompleteResult(data) },
    );
  };

  const handleRetake = () => {
    retake.mutate(m.id, {
      onSuccess: () => {
        setShownIds(new Set());
        setCollectedAnswers({});
        setCompleteResult(null);
        setWatchedPct(0);
        maxReachedRef.current = 0;
        lastCheckpointedPctRef.current = 0;
        setRetaking(true);
        if (videoRef.current) videoRef.current.currentTime = 0;
      },
    });
  };

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
            {inVideoQuestions.length > 0 && ` · ${inVideoQuestions.length} in-video question${inVideoQuestions.length > 1 ? "s" : ""}`}
          </div>
        </div>
        {m.completed && <span className="text-[11.5px] font-medium text-success">Completed</span>}
      </div>

      {m.file_url ? (
        <div className="relative mb-2">
          <VideoPlayer title={m.title}>
            <VideoSkin className="max-h-[280px] w-full overflow-hidden rounded-lg bg-ink" style={{ aspectRatio: "16 / 9" }}>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <Video
                ref={videoRef} src={m.file_url} onTimeUpdate={onTimeUpdate} onSeeking={onSeeking} onPlay={onPlay}
                onLoadedMetadata={onLoadedMetadata}
              />
            </VideoSkin>
          </VideoPlayer>
          {activeQuestion && <InVideoQuestionOverlay question={activeQuestion} onResolve={resolveActiveQuestion} />}
        </div>
      ) : (
        <div className="mb-2 flex h-[140px] items-center justify-center rounded-lg bg-ink">
          <PlayCircle size={32} color="rgba(255,255,255,0.5)" />
        </div>
      )}

      {completeResult?.video_question_results.length ? (
        <div className="mb-2 flex flex-col gap-1">
          {completeResult.video_total_points !== null && (
            <p className="text-[12px] font-medium text-ink">
              Marks: {completeResult.video_earned_points}/{completeResult.video_total_points}
            </p>
          )}
          {completeResult.video_question_results.map((r, i) => (
            <div key={r.question_id} className="flex items-center gap-1.5 text-[11.5px]">
              {r.correct ? <CheckCircle2 size={12} color="var(--color-success)" /> : <XCircle size={12} color="var(--color-danger)" />}
              <span className="text-ink-soft">In-video question {i + 1} — {r.correct ? "correct" : "not correct"}</span>
            </div>
          ))}
        </div>
      ) : null}

      {showMarkComplete && (
        <>
          <div className="mb-1.5 text-[11.5px] text-ink-faint">
            Watched {watchedPct}% · need {m.threshold}% to mark this complete
            {m.video_question_min_correct !== null &&
              ` · ${shownIds.size}/${inVideoQuestions.length} in-video questions answered, need ${m.video_question_min_correct} correct`}
          </div>
          {complete.isError && (
            <div className="mb-1.5 text-[11px] text-danger">
              {(complete.error as Error)?.message || "Couldn't mark this complete. Try again."}
            </div>
          )}
          <button
            onClick={handleComplete}
            disabled={needsMore || !!activeQuestion || complete.isPending}
            title={needsMore ? `Keep watching — ${m.threshold - watchedPct}% to go` : undefined}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
          >
            {complete.isPending && <Loader2 size={12} className="animate-spin" />}
            Mark complete
          </button>
        </>
      )}

      {showRetakeGate && (
        <>
          <div className="mb-1.5 text-[11.5px] text-ink-faint">
            {m.completed
              ? `You've already passed this video's in-video questions${m.score !== null ? ` — scored ${m.score}%` : ""}.`
              : "You've already answered every in-video question on your last attempt."}
            {" "}Replaying the video won't ask them again — watch it as many times as you like.
          </div>
          {retake.isError && (
            <div className="mb-1.5 text-[11px] text-danger">
              {(retake.error as Error)?.message || "Couldn't start a retake. Try again."}
            </div>
          )}
          {canRetake ? (
            <button
              onClick={handleRetake}
              disabled={retake.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink disabled:opacity-40"
            >
              {retake.isPending && <Loader2 size={12} className="animate-spin" />}
              {m.completed ? "Retake for a higher score" : "Retake to try for a passing score"}
              {limit !== null && ` (${m.attempts_used}/${limit} attempts used)`}
            </button>
          ) : (
            <p className="text-[11.5px] text-danger">
              You've used all {limit} attempt{limit === 1 ? "" : "s"} allowed for this video's questions — you can still rewatch the video anytime.
            </p>
          )}
        </>
      )}
    </div>
  );
}

/** A module this course's sequential-unlock order, or one of the
 * module's own restrictions, hasn't opened up yet — no player, no quiz,
 * no "mark complete", just what it is and why not. */
function LockedRow({ module: m }: { module: LearnerModule }) {
  return (
    <div className="flex items-center gap-3 border-b border-line-soft py-3 opacity-50">
      <Lock size={18} color="var(--color-ink-faint)" />
      <div className="flex-1">
        <div className="text-[13.5px] text-ink-faint">{m.title}</div>
        <div className="text-[11px] text-ink-faint">
          {MODULE_TYPE_LABEL[m.type]} · {m.lock_reason ?? "Locked"}
        </div>
      </div>
    </div>
  );
}

/** A SCORM module's row — mounts the ScormPlayer and wires its three
 * callbacks onto the matching preview-mode backend calls. */
function ScormModuleRow({
  module: m, courseId, complete,
}: { module: LearnerModule; courseId: string; complete: ReturnType<typeof useCompleteModule> }) {
  const checkpoint = useCheckpointScormProgress(courseId);
  const retake = useRetakeScormModule(courseId);
  const [cmiOverride, setCmiOverride] = useState<Record<string, string> | null>(null);
  useEffect(() => {
    if (cmiOverride !== null && Object.keys(m.scorm_cmi).length === 0) setCmiOverride(null);
  }, [cmiOverride, m.scorm_cmi]);

  const limit = m.retake_enabled ? m.retake_limit : 1;
  const retakeAllowed = limit === null || m.attempts_used < limit;

  const viewFired = useRef(false);
  useEffect(() => {
    if (m.scorm_completion_view && !m.completed && m.scorm_launch_path && !viewFired.current) {
      viewFired.current = true;
      complete.mutate({ moduleId: m.id });
    }
  }, [m.scorm_completion_view, m.completed, m.scorm_launch_path, m.id, complete]);

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
            {m.attempts_used > 0 &&
              ` · ${m.attempts_used} attempt${m.attempts_used === 1 ? "" : "s"} used${limit !== null ? ` of ${limit}` : ""}`}
          </div>
        </div>
      </div>
      {complete.isError && (
        <div className="mb-2 text-[11px] text-danger">
          {(complete.error as Error)?.message || "Couldn't record this attempt. Try again."}
        </div>
      )}
      {m.scorm_launch_path ? (
        <ScormPlayer
          key={m.id}
          courseId={courseId} moduleId={m.id} launchPath={m.scorm_launch_path} version={m.scorm_version}
          completed={m.completed} score={m.score} retakeAllowed={retakeAllowed}
          initialCmi={cmiOverride ?? m.scorm_cmi}
          retaking={cmiOverride !== null}
          onCommit={(cmi) => checkpoint.mutate({ moduleId: m.id, cmi })}
          onComplete={(result) =>
            complete.mutate({
              moduleId: m.id,
              scorm_score: result.score ?? undefined,
              scorm_passed: result.passed,
              scorm_status: result.status ?? undefined,
            })
          }
          onRetake={() => {
            setCmiOverride({});
            retake.mutate(m.id);
          }}
        />
      ) : (
        <div className="text-[12.5px] text-ink-faint">This module's SCORM package isn't ready yet.</div>
      )}
    </div>
  );
}

function ModuleRow({ module: m, courseId }: { module: LearnerModule; courseId: string }) {
  const complete = useCompleteModule(courseId);

  if (m.locked) {
    return <LockedRow module={m} />;
  }

  if (m.type === "watch") {
    return <WatchPlayer module={m} courseId={courseId} />;
  }

  if (m.type === "scorm") {
    return <ScormModuleRow module={m} courseId={courseId} complete={complete} />;
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

function QuestionTimer({ seconds, onExpire }: { seconds: number; onExpire: () => void }) {
  const [left, setLeft] = useState(seconds);
  const firedRef = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => {
      setLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!firedRef.current) { firedRef.current = true; onExpire(); }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10.5px]", left <= 5 ? "text-danger" : "text-ink-faint")}>
      <Clock size={10} /> {left}s
    </span>
  );
}

type Answer = { option_id?: string; text?: string };

function QuizPanel({ module: quizModule, courseId }: { module: LearnerModule; courseId: string }) {
  const submit = useSubmitQuiz(courseId);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [result, setResult] = useState<QuizResult | null>(null);
  const [expiredIds, setExpiredIds] = useState<Set<string>>(new Set());
  const [retaking, setRetaking] = useState(false);

  const limit = quizModule.retake_enabled ? quizModule.retake_limit : 1;
  const attemptsLabel = limit !== null ? `attempt ${quizModule.attempts_used + 1} of ${limit}` : `attempt ${quizModule.attempts_used + 1}`;

  if (quizModule.completed && !result && !retaking) {
    const canRetake = limit === null || quizModule.attempts_used < limit;
    return (
      <div className="rounded-lg border border-line bg-surface p-4">
        <div className="font-head text-[15px] text-ink">{quizModule.title}</div>
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-success-soft px-3 py-3">
          <CheckCircle2 size={14} color="var(--color-success)" />
          <span className="text-[12.5px] text-ink">
            You've already passed this quiz{quizModule.score !== null && ` — best score ${quizModule.score}%`}.
          </span>
        </div>
        {canRetake ? (
          <button
            onClick={() => setRetaking(true)}
            className="mt-3 self-start rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink"
          >
            Retake for a higher score{limit !== null && ` (${quizModule.attempts_used}/${limit} attempts used)`}
          </button>
        ) : (
          <p className="mt-2 text-[11.5px] text-ink-faint">
            You've used all {limit} attempt{limit === 1 ? "" : "s"} allowed on this quiz.
          </p>
        )}
      </div>
    );
  }

  const hasRealAnswer = (q: LearnerModule["questions"][number]) => {
    const a = answers[q.id];
    if (!a) return false;
    return q.type === "short_answer" ? !!(a.text ?? "").trim() : !!a.option_id;
  };
  const isAnswered = (q: LearnerModule["questions"][number]) => expiredIds.has(q.id) || hasRealAnswer(q);
  const allAnswered = quizModule.questions.every(isAnswered);

  function handleSubmit() {
    const payload: QuizAnswer[] = quizModule.questions.filter(hasRealAnswer).map((q) => ({
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
        {quizModule.threshold}% · {attemptsLabel}
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
              Scored {result.score}% · {result.earned_points}/{result.total_points} marks
              {" "}({result.passed ? "passed" : `needed ${result.threshold}% to pass`})
              {result.course_completed && " · course completed 🎉"}
            </span>
          </div>

          <p className="text-[11px] text-ink-faint">
            {result.attempts_remaining !== null
              ? `${result.attempts_used} attempt${result.attempts_used === 1 ? "" : "s"} used · ${result.attempts_remaining} remaining`
              : `${result.attempts_used} attempt${result.attempts_used === 1 ? "" : "s"} used`}
          </p>

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

          {result.retake_allowed ? (
            <button
              onClick={() => { setResult(null); setExpiredIds(new Set()); setRetaking(true); }}
              className="self-start rounded-lg border border-line px-3 py-1.5 text-[12px] font-medium text-ink"
            >
              {result.passed ? "Retake for a higher score" : "Retake to try for a passing score"}
            </button>
          ) : !result.passed ? (
            <p className="text-[11.5px] text-danger">
              No more attempts allowed on this quiz.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-4">
          {quizModule.questions.map((q, qi) => {
            const expired = expiredIds.has(q.id);
            return (
              <div key={q.id} className={expired ? "opacity-50" : undefined}>
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[13px] text-ink">
                    {qi + 1}. {q.text} <span className="text-[10.5px] text-ink-faint">({q.points} mark{q.points === 1 ? "" : "s"})</span>
                  </div>
                  {q.timer_seconds !== null && !expired && (
                    <QuestionTimer seconds={q.timer_seconds} onExpire={() => setExpiredIds((s) => new Set(s).add(q.id))} />
                  )}
                  {expired && <span className="text-[10.5px] text-danger shrink-0">Time&apos;s up</span>}
                </div>
                {q.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={q.image_url} alt="" className="mt-1.5 max-h-40 rounded-lg border border-line-soft object-contain" />
                )}

                {q.type === "short_answer" ? (
                  <input
                    value={answers[q.id]?.text ?? ""} disabled={expired}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: { text: e.target.value } }))}
                    placeholder="Your answer"
                    className="mt-1.5 w-full rounded-lg border border-line px-2.5 py-1.5 text-[12.5px] outline-none disabled:cursor-not-allowed"
                  />
                ) : (
                  <div className="mt-1.5 flex flex-col gap-1">
                    {q.options.map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 py-0.5">
                        <input
                          type="radio"
                          name={q.id} disabled={expired}
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
            );
          })}

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

export default function CoursePreviewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: course, isLoading, isError } = usePreviewCourse(id);
  const reset = useResetCoursePreview(id);
  const [tab, setTab] = useState<TabId>("content");
  const [confirmingReset, setConfirmingReset] = useState(false);

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
        <BackLink label="Back to course" />
        <p className="mt-6 text-[13px] text-ink-faint">This course couldn't be found.</p>
      </div>
    );
  }

  const mods = course.modules;
  const quizModule = mods.find((m) => m.type === "quiz" && m.questions.length > 0);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1080px] flex-1 flex-col">
      <div className="flex items-center justify-between gap-2 px-4 py-3 md:px-0">
        <BackLink label={course.title} />
        {confirmingReset ? (
          <div className="flex items-center gap-2">
            <span className="text-[11.5px] text-ink-faint">Clear your progress on this course?</span>
            <button
              onClick={() => reset.mutate(undefined, { onSuccess: () => setConfirmingReset(false) })}
              disabled={reset.isPending}
              className="rounded-md bg-danger px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-60"
            >
              {reset.isPending ? "Resetting…" : "Reset"}
            </button>
            <button onClick={() => setConfirmingReset(false)} className="text-[11px] text-ink-faint">Cancel</button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmingReset(true)}
            className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11.5px] font-medium text-ink-soft"
          >
            <RotateCcw size={12} /> Reset my progress
          </button>
        )}
      </div>

      <div className="mx-4 mb-1 flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-2 md:mx-0">
        <span className="text-[11.5px] text-ink">
          Viewing as admin/teacher — this is exactly what a learner sees, but your progress here is yours alone and never affects any real learner's gradebook, leaderboard or certificates.
        </span>
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

        {course.locked && (
          <div className="mt-4 flex items-center gap-2.5 rounded-lg border border-line-soft bg-line-soft/40 px-4 py-3">
            <Lock size={16} color="var(--color-ink-faint)" />
            <span className="text-[12.5px] text-ink-faint">
              {course.locked_reason ?? "This course is locked until a prerequisite is complete."}
            </span>
          </div>
        )}

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
                AI summary generates once you've watched this module's content.
              </span>
            </div>
          )}

          {tab === "quiz" &&
            (quizModule ? (
              quizModule.locked ? (
                <div className="flex items-center gap-2 rounded-lg border border-line bg-surface px-4 py-6">
                  <Lock size={14} color="var(--color-ink-faint)" />
                  <span className="text-[12.5px] text-ink-faint">{quizModule.lock_reason ?? "This quiz is locked."}</span>
                </div>
              ) : (
                <QuizPanel module={quizModule} courseId={course.id} />
              )
            ) : (
              <div className="text-[13px] text-ink-faint">No quiz on this course yet.</div>
            ))}

          {tab === "reviews" && <CourseReviewsPanel courseId={course.id} />}
        </div>
      </div>
    </div>
  );
}

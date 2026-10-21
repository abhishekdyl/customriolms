"use client";
import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { API_URL, getAccessTokenForUrl } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/**
 * A SCORM 1.2/2004 JS API shim plus the sandboxed iframe that plays the
 * package. SCORM content looks for a global named `API` (1.2) or
 * `API_1484_11` (2004) on itself or an ancestor window — it never talks
 * to a backend directly — so the shim lives here, on the page that
 * embeds the iframe, as a plain in-memory CMI data model seeded from
 * whatever the backend last saved (see ScormProgress on the backend).
 *
 * Two things reach the backend:
 *  - every LMSCommit/Commit call hands the package's full CMI snapshot
 *    to `onCommit`, which checkpoints it (see useCheckpointScormProgress)
 *    so a reload/new-tab/relogin resumes the package exactly where it
 *    left off — the package's own internal resume logic (reading
 *    cmi.suspend_data / cmi.core.lesson_location back out on
 *    LMSInitialize) does the rest; the LMS doesn't need to understand
 *    what's inside suspend_data, only to give it back intact.
 *  - the moment the package reports a completion/pass/fail status,
 *    `onComplete` is called once with the score and pass/fail it found —
 *    the real module-completion call (see ModuleRow) maps that onto
 *    ModuleProgress.score + a QuizAttempt row on the backend, same "every
 *    submission gets a row" convention QUIZ and WATCH already follow.
 *
 * `allow-same-origin` is required in the iframe sandbox for the
 * package's own script to find `window.parent.API` at all — that's the
 * normal, spec-expected way SCORM content locates its LMS API, not a
 * security hole specific to this player.
 */

export type ScormResult = { score: number | null; passed: boolean | null; status: string | null };
type OnComplete = (result: ScormResult) => void;
type OnCommit = (cmi: Record<string, string>) => void;

function parseScore(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) ? Math.round(n) : null;
}

// Exported for direct unit testing of the SCORM API-mapping logic itself
// (see scratchpad/smoke's shim test) — not used elsewhere outside this file.
export function buildScorm12Api(cmi: Record<string, string>, onComplete: OnComplete, onCommit: OnCommit) {
  let initialized = false;
  const checkComplete = () => {
    const status = cmi["cmi.core.lesson_status"];
    // SCORM 1.2 overloads lesson_status with both "done at all" values
    // (completed/browsed/not attempted/incomplete) AND pass/fail opinion
    // (passed/failed) — see Module's docstring. "passed"/"failed" carry
    // an explicit opinion; "completed" means done with no opinion at all
    // (ScormPlayer/ModuleRow treats that as a pass, same as a WATCH
    // module with no in-video questions always passing once watched).
    if (status === "passed" || status === "completed") {
      onComplete({ score: parseScore(cmi["cmi.core.score.raw"]), passed: status === "passed" ? true : null, status });
    } else if (status === "failed") {
      onComplete({ score: parseScore(cmi["cmi.core.score.raw"]), passed: false, status });
    }
  };
  return {
    LMSInitialize: () => { initialized = true; return "true"; },
    LMSFinish: () => { initialized = false; checkComplete(); onCommit({ ...cmi }); return "true"; },
    LMSGetValue: (key: string) => cmi[key] ?? "",
    LMSSetValue: (key: string, value: string) => { cmi[key] = value; checkComplete(); return "true"; },
    LMSCommit: () => { onCommit({ ...cmi }); return "true"; },
    LMSGetLastError: () => "0",
    LMSGetErrorString: () => "No error",
    LMSGetDiagnostic: () => "",
    __initialized: () => initialized,
  };
}

export function buildScorm2004Api(cmi: Record<string, string>, onComplete: OnComplete, onCommit: OnCommit) {
  let initialized = false;
  const checkComplete = () => {
    const completion = cmi["cmi.completion_status"];
    const success = cmi["cmi.success_status"];
    if (success === "passed") {
      onComplete({ score: parseScore(cmi["cmi.score.raw"]), passed: true, status: success });
    } else if (success === "failed") {
      onComplete({ score: parseScore(cmi["cmi.score.raw"]), passed: false, status: success });
    } else if (completion === "completed") {
      // No success_status opinion at all (content with no pass/fail
      // concept, e.g. a reference doc) — "completed" alone is enough.
      onComplete({ score: parseScore(cmi["cmi.score.raw"]), passed: null, status: completion });
    }
  };
  return {
    Initialize: () => { initialized = true; return "true"; },
    Terminate: () => { initialized = false; checkComplete(); onCommit({ ...cmi }); return "true"; },
    GetValue: (key: string) => cmi[key] ?? "",
    SetValue: (key: string, value: string) => { cmi[key] = value; checkComplete(); return "true"; },
    Commit: () => { onCommit({ ...cmi }); return "true"; },
    GetLastError: () => "0",
    GetErrorString: () => "No error",
    GetDiagnostic: () => "",
    __initialized: () => initialized,
  };
}

export function ScormPlayer({
  courseId, moduleId, launchPath, version, completed, score, retakeAllowed, initialCmi, onComplete, onCommit, onRetake, retaking,
}: {
  courseId: string; moduleId: string; launchPath: string; version: string | null;
  completed: boolean; score: number | null;
  /** Whether another attempt is still allowed once this one finishes —
   * mirrors QuizPanel's own retake affordance. */
  retakeAllowed: boolean;
  /** The package's own last-saved CMI state (ScormProgress.cmi_data) —
   * seeded into the shim on mount so the package resumes itself. */
  initialCmi: Record<string, string>;
  onComplete: (result: ScormResult) => void;
  /** Fired on every LMSCommit/Commit so progress survives a reload. */
  onCommit: (cmi: Record<string, string>) => void;
  onRetake: () => void;
  retaking: boolean;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [fired, setFired] = useState<ScormResult | null>(null);

  useEffect(() => {
    // Installed on *this* window before the iframe ever loads — SCORM
    // content run inside it looks up window.parent.API / API_1484_11,
    // which from the iframe's point of view is exactly this window.
    // Seeded from whatever was last saved, so the package's own
    // suspend_data/lesson_location resume logic has something to read.
    const cmi: Record<string, string> = { ...initialCmi };
    const handleComplete: OnComplete = (result) => {
      if (fired || completed) return;
      setFired(result);
      onComplete(result);
    };
    (window as unknown as Record<string, unknown>).API = buildScorm12Api(cmi, handleComplete, onCommit);
    (window as unknown as Record<string, unknown>).API_1484_11 = buildScorm2004Api(cmi, handleComplete, onCommit);
    return () => {
      delete (window as unknown as Record<string, unknown>).API;
      delete (window as unknown as Record<string, unknown>).API_1484_11;
    };
    // Re-seeds (and reinstalls fresh, so a just-cleared cmi after a
    // retake doesn't carry over stale values) whenever the module, or
    // what it should resume from, changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId, initialCmi]);

  const token = getAccessTokenForUrl();
  const src = `${API_URL}/api/v1/courses/${courseId}/modules/${moduleId}/scorm-content/${launchPath}?token=${encodeURIComponent(token ?? "")}`;
  const effectiveScore = fired?.score ?? score;
  const effectivePassed = fired?.passed;
  const done = completed || !!fired;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <iframe
        key={retaking ? "retake" : "attempt"}
        ref={iframeRef}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="h-[480px] w-full border-0 bg-white"
        title="SCORM content"
      />
      <div className="flex items-center justify-between gap-2 border-t border-line-soft bg-surface px-3 py-1.5">
        <span className="text-[10.5px] text-ink-faint">SCORM {version ?? "1.2"}</span>
        <div className="flex items-center gap-2">
          {done && effectiveScore !== null && (
            <span className="text-[10.5px] text-ink-faint">Score {effectiveScore}%</span>
          )}
          {done && (
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[10.5px] font-medium",
                effectivePassed === false ? "bg-danger-soft text-danger" : "bg-success-soft text-success",
              )}
            >
              {effectivePassed === false ? "Failed" : "Completed"}
            </span>
          )}
          {done && retakeAllowed && (
            <button
              type="button"
              onClick={onRetake}
              className="flex items-center gap-1 rounded-md border border-line px-2 py-1 text-[10.5px] font-medium text-ink"
            >
              <RotateCcw size={10} /> Retake
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { API_URL, getAccessTokenForUrl } from "@/lib/api-client";

/**
 * A SCORM 1.2/2004 JS API shim plus the sandboxed iframe that plays the
 * package. SCORM content looks for a global named `API` (1.2) or
 * `API_1484_11` (2004) on itself or an ancestor window — it never talks
 * to a backend directly — so the shim lives here, on the page that
 * embeds the iframe, as a plain in-memory CMI data model. The only part
 * that reaches our backend is the one thing that actually matters:
 * mapping a completion/pass status onto the real module-completion call.
 *
 * `allow-same-origin` is required in the iframe sandbox for the
 * package's own script to find `window.parent.API` at all — that's the
 * normal, spec-expected way SCORM content locates its LMS API, not a
 * security hole specific to this player.
 */

type OnComplete = () => void;

// Exported for direct unit testing of the SCORM API-mapping logic itself
// (see scratchpad/smoke's shim test) — not used elsewhere outside this file.
export function buildScorm12Api(cmi: Record<string, string>, onComplete: OnComplete) {
  let initialized = false;
  return {
    LMSInitialize: () => { initialized = true; return "true"; },
    LMSFinish: () => { initialized = false; return "true"; },
    LMSGetValue: (key: string) => cmi[key] ?? "",
    LMSSetValue: (key: string, value: string) => {
      cmi[key] = value;
      if (key === "cmi.core.lesson_status" && (value === "completed" || value === "passed")) {
        onComplete();
      }
      return "true";
    },
    LMSCommit: () => "true",
    LMSGetLastError: () => "0",
    LMSGetErrorString: () => "No error",
    LMSGetDiagnostic: () => "",
    __initialized: () => initialized,
  };
}

export function buildScorm2004Api(cmi: Record<string, string>, onComplete: OnComplete) {
  let initialized = false;
  return {
    Initialize: () => { initialized = true; return "true"; },
    Terminate: () => { initialized = false; return "true"; },
    GetValue: (key: string) => cmi[key] ?? "",
    SetValue: (key: string, value: string) => {
      cmi[key] = value;
      const completionDone = key === "cmi.completion_status" && value === "completed";
      const successDone = key === "cmi.success_status" && value === "passed";
      if (completionDone || successDone) onComplete();
      return "true";
    },
    Commit: () => "true",
    GetLastError: () => "0",
    GetErrorString: () => "No error",
    GetDiagnostic: () => "",
    __initialized: () => initialized,
  };
}

export function ScormPlayer({
  courseId, moduleId, launchPath, version, completed, onComplete,
}: {
  courseId: string; moduleId: string; launchPath: string; version: string | null;
  completed: boolean; onComplete: () => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [fired, setFired] = useState(false);

  useEffect(() => {
    // Installed on *this* window before the iframe ever loads — SCORM
    // content run inside it looks up window.parent.API / API_1484_11,
    // which from the iframe's point of view is exactly this window.
    const cmi: Record<string, string> = {};
    const handleComplete: OnComplete = () => {
      if (fired || completed) return;
      setFired(true);
      onComplete();
    };
    (window as unknown as Record<string, unknown>).API = buildScorm12Api(cmi, handleComplete);
    (window as unknown as Record<string, unknown>).API_1484_11 = buildScorm2004Api(cmi, handleComplete);
    return () => {
      delete (window as unknown as Record<string, unknown>).API;
      delete (window as unknown as Record<string, unknown>).API_1484_11;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [moduleId]);

  const token = getAccessTokenForUrl();
  const src = `${API_URL}/api/v1/courses/${courseId}/modules/${moduleId}/scorm-content/${launchPath}?token=${encodeURIComponent(token ?? "")}`;

  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <iframe
        ref={iframeRef}
        src={src}
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        className="h-[480px] w-full border-0 bg-white"
        title="SCORM content"
      />
      <div className="flex items-center justify-between border-t border-line-soft bg-surface px-3 py-1.5">
        <span className="text-[10.5px] text-ink-faint">SCORM {version ?? "1.2"}</span>
        {(completed || fired) && <span className="text-[10.5px] font-medium text-success">Completed</span>}
      </div>
    </div>
  );
}

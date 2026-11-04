"use client";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { AlertTriangle, Bug, X } from "lucide-react";
import { usePlatformStatus } from "@/lib/hooks/use-orgs";
import { useDebugEntries } from "@/lib/hooks/use-debug-entries";
import { clearDebugEntries } from "@/lib/debug-store";

/**
 * Moodle-style "developer debug mode": while Platform Settings ▸ System
 * ▸ Debug mode is on, any API error or uncaught frontend error on the
 * current page prints here — ABOVE the page's own header, like Moodle's
 * debug messages — instead of failing silently. The rest of the page
 * underneath keeps rendering normally either way; this never blocks it.
 *
 * Deliberately global (mounted once in the root layout) rather than
 * per-shell, so it also covers /login and the other (auth) pages —
 * useful on its own (a broken login API call shows here too), and it's
 * where most people will actually be looking when something's wrong
 * during the brief window this is meant to be left on for.
 */
export function DebugBar() {
  const pathname = usePathname();
  const { data: status } = usePlatformStatus();
  const entries = useDebugEntries();

  // "What went wrong on THIS page" — same spirit as Moodle re-evaluating
  // debug messages fresh on every page load, not an ever-growing log.
  useEffect(() => {
    clearDebugEntries();
  }, [pathname]);

  if (!status?.debug_mode || entries.length === 0) return null;

  return (
    <div className="border-b border-amber/40 bg-amber-soft px-4 py-2">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-amber">
          <Bug className="h-3 w-3" /> Debug mode — {entries.length} issue{entries.length === 1 ? "" : "s"} on this page
        </div>
        <button onClick={() => clearDebugEntries()} aria-label="Dismiss" className="text-amber/70 hover:text-amber">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-1">
        {entries.map((e) => (
          <div key={e.id} className="flex items-start gap-2 text-[12.5px] text-ink">
            <AlertTriangle className={`mt-0.5 h-3.5 w-3.5 flex-shrink-0 ${e.level === "error" ? "text-danger" : "text-amber"}`} />
            <span>
              <strong>{e.message}</strong>
              {e.detail && <span className="text-ink-soft"> — {e.detail}</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

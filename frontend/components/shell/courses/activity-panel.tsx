"use client";
import { History } from "lucide-react";
import { useCourseActivity } from "@/lib/hooks/use-courses";
import { AUDIT_ACTION_LABEL } from "@/lib/audit-log-labels";

/** "Kisne kya badla, kab" for one course — every edit to the course
 * itself plus every module under it (content saves, file/SCORM replaces,
 * quiz questions, restrictions, deletes), newest first. Read-only; the
 * full org-wide version of this same feed lives on the Audit Log page. */
export function ActivityPanel({ courseId }: { courseId: string }) {
  const { data: rows, isLoading } = useCourseActivity(courseId);

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-1 text-xs font-medium text-ink-faint">Change log</p>
      <p className="mb-3 text-[11.5px] text-ink-faint">
        Every save on this course — its own settings and every module&apos;s content, files, quiz questions, and
        restrictions — who made it and when. Changes apply immediately; this is a record, not a draft/undo.
      </p>

      <div className="overflow-hidden rounded-[10px] border border-line-soft">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-line-soft text-[11px] text-ink-faint">
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Who</th>
              <th className="px-3 py-2 font-medium">What</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={3} className="px-3 py-4 text-center text-ink-faint">Loading…</td></tr>
            )}
            {!isLoading && !rows?.length && (
              <tr>
                <td colSpan={3} className="px-3 py-6 text-center text-ink-faint">
                  <History className="mx-auto mb-1.5 h-4 w-4" /> No changes logged yet.
                </td>
              </tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id} className="border-t border-line-soft align-top">
                <td className="whitespace-nowrap px-3 py-2.5 text-ink-faint">{new Date(r.created_at).toLocaleString()}</td>
                <td className="whitespace-nowrap px-3 py-2.5 text-ink">{r.actor_name}</td>
                <td className="px-3 py-2.5 text-ink-soft">
                  <span className="mr-1.5 font-medium text-ink">{AUDIT_ACTION_LABEL[r.action] ?? r.action}:</span>
                  <span className="text-ink-faint">{r.detail}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

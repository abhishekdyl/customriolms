"use client";

import { useState } from "react";
import { History } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { useAuditLog } from "@/lib/hooks/use-audit-log";
import { AUDIT_ACTION_LABEL } from "@/lib/audit-log-labels";

const FAMILIES = [
  { value: "", label: "All" },
  { value: "course", label: "Courses" },
  { value: "module", label: "Modules" },
  { value: "user", label: "Users" },
];

/** "Kisne kya badla, kab" — every course create/publish/update/delete and
 * user role change in this org, newest first. Org Admin only. */
export default function AuditLogPage() {
  const [family, setFamily] = useState("");
  const { data: rows, isLoading } = useAuditLog(family || undefined);

  return (
    <div className="flex flex-col h-screen min-w-0 flex-1">
      <Topbar title="Audit Log" />
      <div className="p-5 md:p-8 overflow-auto flex-1">
        <p className="mb-4 max-w-[640px] text-[11.5px] text-ink-faint">
          Who changed a course, graded an attempt, or edited a user&apos;s role — every admin-meaningful write in
          this org, newest first. Written automatically; nothing here can be edited or deleted.
        </p>

        <div className="mb-4 flex gap-1.5">
          {FAMILIES.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFamily(f.value)}
              className={`rounded-full border px-3 py-1 text-[11.5px] ${
                family === f.value ? "border-ink bg-ink text-white" : "border-line text-ink-soft"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="max-w-[900px] overflow-hidden rounded-[10px] border border-line">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="bg-line-soft text-[11px] text-ink-faint">
                <th className="px-3 py-2 font-medium">When</th>
                <th className="px-3 py-2 font-medium">Who</th>
                <th className="px-3 py-2 font-medium">Action</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 font-medium">Detail</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr><td colSpan={5} className="px-3 py-4 text-center text-ink-faint">Loading…</td></tr>
              )}
              {!isLoading && !rows?.length && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-faint">
                    <History className="mx-auto mb-1.5 h-4 w-4" /> Nothing logged yet.
                  </td>
                </tr>
              )}
              {rows?.map((r) => (
                <tr key={r.id} className="border-t border-line-soft align-top">
                  <td className="whitespace-nowrap px-3 py-2.5 text-ink-faint">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2.5 text-ink">{r.actor_name}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{AUDIT_ACTION_LABEL[r.action] ?? r.action}</td>
                  <td className="max-w-[160px] truncate px-3 py-2.5 text-ink-faint" title={r.entity_label}>{r.entity_label}</td>
                  <td className="px-3 py-2.5 text-ink-faint">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

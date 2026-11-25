"use client";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import type { OrgUsage } from "@/lib/types";
import { planLabel, planStyle, statusStyle } from "@/lib/org-display";
import { cn } from "@/lib/utils";

function percentStyle(percent: number): string {
  if (percent >= 90) return "text-danger";
  if (percent >= 70) return "text-amber";
  return "text-ink-soft";
}

function MiniBar({ percent }: { percent: number }) {
  const style = percent >= 90 ? "bg-danger" : percent >= 70 ? "bg-amber" : "bg-primary";
  return (
    <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-line-soft">
      <div className={cn("h-full rounded-full", style)} style={{ width: `${Math.min(percent, 100)}%` }} />
    </div>
  );
}

/** One row per org, click-through to the per-org drill-down. Warns
 * (amber/red % + an alert icon) once storage or seats crosses 70%/90%
 * of that org's own plan quota — the two numbers a Super Admin most
 * needs to catch before an org actually hits its limit. */
export function OrgUsageTable({ rows }: { rows: OrgUsage[] }) {
  const router = useRouter();

  if (rows.length === 0) {
    return <p className="px-4 py-8 text-center text-[12.5px] text-ink-faint">No organizations yet.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-line-soft bg-surface">
      <table className="w-full min-w-[920px] text-left text-[12.5px]">
        <thead>
          <tr className="border-b border-line-soft text-[10.5px] font-medium uppercase tracking-wide text-ink-faint">
            <th className="px-4 py-3">Organization</th>
            <th className="px-4 py-3">Plan</th>
            <th className="px-4 py-3">Users</th>
            <th className="px-4 py-3">Storage</th>
            <th className="px-4 py-3">Requests today</th>
            <th className="px-4 py-3">Avg response</th>
            <th className="px-4 py-3">Active today</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const userPercent = r.user_limit ? (r.user_count / r.user_limit) * 100 : 0;
            const warn = r.storage_percent >= 90 || userPercent >= 90;
            return (
              <tr
                key={r.org_id} onClick={() => router.push(`/usage-monitoring/${r.org_id}`)}
                className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-bg-soft"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    {warn && <AlertTriangle size={12} className="shrink-0 text-danger" />}
                    {r.org_name}
                  </div>
                  <span className={cn("rounded-full px-1.5 py-0.5 text-[9.5px] font-medium", statusStyle[r.status])}>{r.status}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-[10.5px] font-medium", planStyle[r.plan])}>{planLabel[r.plan]}</span>
                </td>
                <td className="px-4 py-3">
                  <span className={percentStyle(userPercent)}>{r.user_count} / {r.user_limit}</span>
                  <MiniBar percent={userPercent} />
                </td>
                <td className="px-4 py-3">
                  <span className={percentStyle(r.storage_percent)}>
                    {(r.storage_mb / 1024).toFixed(2)} GB / {(r.storage_limit_mb / 1024).toFixed(0)} GB
                  </span>
                  <MiniBar percent={r.storage_percent} />
                </td>
                <td className="px-4 py-3 text-ink-soft">{r.requests_today}</td>
                <td className="px-4 py-3 text-ink-soft">{r.avg_response_ms} ms</td>
                <td className="px-4 py-3 text-ink-soft">{r.active_users_today}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

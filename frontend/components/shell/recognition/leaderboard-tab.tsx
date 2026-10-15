"use client";
import { useState } from "react";
import { Award } from "lucide-react";
import { useTeams } from "@/lib/hooks/use-teams";
import { useUsers } from "@/lib/hooks/use-users";

const medal: Record<number, string> = { 0: "#FFC542", 1: "#C7CBDB", 2: "#E0A672" };

export function LeaderboardTab({ query = "" }: { query?: string }) {
  const { data: users = [] } = useUsers();
  const { data: teams = [] } = useTeams();
  const [teamFilter, setTeamFilter] = useState("All teams");

  // No points ledger exists in the backend yet — everyone is at 0 until progress tracking lands,
  // so ranking falls back to name order.
  const ranked = users
    .filter((u) => u.role === "learner" && u.status !== "deactivated")
    .filter((u) => teamFilter === "All teams" || u.team_name === teamFilter)
    .filter((u) => u.full_name.toLowerCase().includes(query.trim().toLowerCase()))
    .map((u) => ({ ...u, points: 0 }))
    .sort((a, b) => b.points - a.points || a.full_name.localeCompare(b.full_name));

  return (
    <div className="max-w-[560px]">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[12.5px] text-ink-faint max-w-[340px]">
          Ranked by total points — earned from course completions, streaks, and quiz performance.
        </p>
        <select
          value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
          className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-surface"
        >
          <option>All teams</option>
          {teams.map((t) => <option key={t.id}>{t.name}</option>)}
        </select>
      </div>
      <div className="flex flex-col gap-2">
        {ranked.map((u, i) => (
          <div key={u.id} className="flex items-center gap-3 p-3 bg-surface border border-line rounded-[10px]">
            {i < 3 ? (
              <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center" style={{ background: medal[i] }}>
                <Award size={14} className="text-white" />
              </div>
            ) : (
              <div className="w-7 text-center shrink-0"><span className="font-head text-[13px] text-ink-faint">{i + 1}</span></div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink font-medium">{u.full_name}</div>
              <div className="text-[11px] text-ink-faint">{u.team_name ?? "No team"}</div>
            </div>
            <span className="font-head text-[14px] text-ink">{u.points.toLocaleString()}</span>
          </div>
        ))}
        {ranked.length === 0 && (
          <div className="p-6 text-center text-[13px] text-ink-faint bg-surface border border-line rounded-[10px]">No learners to rank yet.</div>
        )}
      </div>
    </div>
  );
}

"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, TrendingUp, TrendingDown, Plus } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { useTeams } from "@/lib/hooks/use-teams";
import { useUsers } from "@/lib/hooks/use-users";
import { useSkills } from "@/lib/hooks/use-skills";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { heatColor, heatValue } from "@/lib/sample-data";

function StatBlock({
  label, value, suffix, delta, positive,
}: { label: string; value: string | number; suffix?: string; delta?: string; positive?: boolean }) {
  return (
    <div className="px-4 py-4 bg-surface border border-line rounded-lg">
      <div className="text-[12px] text-ink-soft">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span className="font-head text-[24px] text-ink tabular-nums">{value}</span>
        {suffix && <span className="text-[13px] text-ink-faint">{suffix}</span>}
      </div>
      {delta && (
        <div className={`flex items-center gap-1 mt-1.5 text-[11px] ${positive ? "text-success" : "text-danger"}`}>
          {positive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
          <span>{delta}</span>
        </div>
      )}
    </div>
  );
}

// Static sample data — no progress tracking exists in the backend yet.
const SAMPLE_TEAMS = ["Assembly Line Ops", "Quality & Compliance", "Warehouse & Logistics", "Maintenance"];
const SAMPLE_SKILLS = ["Safety", "Quality Systems", "Data Privacy", "Leadership"];
const ROW_PATTERN = [
  { completion: 86, overdue: 4, trend: 5 },
  { completion: 91, overdue: 2, trend: 3 },
  { completion: 64, overdue: 9, trend: -4 },
  { completion: 78, overdue: 3, trend: 2 },
];

function OrgAdminDashboard() {
  const { data: teamsData } = useTeams();
  const { data: users } = useUsers();
  const { data: skillsData } = useSkills();
  const [search, setSearch] = useState("");

  const teams = useMemo(
    () =>
      teamsData && teamsData.length > 0
        ? teamsData.map((t) => ({ id: t.id, name: t.name, members: t.member_count }))
        : SAMPLE_TEAMS.map((n, i) => ({ id: `s${i}`, name: n, members: [42, 28, 51, 19][i] })),
    [teamsData],
  );
  const skills = useMemo(
    () =>
      skillsData && skillsData.length > 0
        ? skillsData.slice(0, 8).map((s) => ({ id: s.id, name: s.name }))
        : SAMPLE_SKILLS.map((n, i) => ({ id: `k${i}`, name: n })),
    [skillsData],
  );

  const activeLearners = (users ?? []).filter((u) => u.role === "learner" && u.status === "active").length;

  const q = search.trim().toLowerCase();
  const rows = teams.map((t, i) => ({ ...t, ...ROW_PATTERN[i % 4], idx: i }));
  const teamMatches = (name: string) => name.toLowerCase().includes(q);
  const skillMatch = q ? skills.some((s) => s.name.toLowerCase().includes(q)) : false;

  // Search matches team names; if it matches a skill name instead, show all teams and focus those skill columns.
  const filteredRows = !q ? rows : rows.filter((r) => teamMatches(r.name)).length > 0 || !skillMatch
    ? rows.filter((r) => teamMatches(r.name))
    : rows;
  const visibleSkills = !q ? skills.map((s, i) => ({ ...s, i }))
    : skills.map((s, i) => ({ ...s, i })).filter((s) => !skillMatch || s.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col h-screen min-w-0 flex-1">
      <Topbar title="Organization dashboard" search={search} onSearch={setSearch} placeholder="Search teams, skills…" />

      <div className="p-5 md:p-8 overflow-auto flex-1">
        <div className="grid gap-3 mb-6 grid-cols-2 md:grid-cols-4">
          <StatBlock label="Active learners" value={activeLearners} delta="+8 this month" positive />
          <StatBlock label="Org completion" value="79" suffix="%" delta="+3pts vs last qtr" positive />
          <StatBlock label="Overdue trainings" value="18" delta="+6 vs last week" positive={false} />
          <StatBlock label="AI-flagged gaps" value="3" delta="new this week" positive={false} />
        </div>

        <div className="flex items-start gap-3 px-4 py-4 mb-6 bg-primary-soft border-l-[3px] border-primary rounded-md">
          <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
          <div>
            <div className="text-[13px] text-ink font-medium">AI insight</div>
            <div className="text-[13px] text-ink-soft mt-0.5">
              Assembly Line Ops is trailing on Data Privacy Basics — mostly learners hired in the last 60 days. Consider assigning the refresher module before month end.
            </div>
          </div>
        </div>

        <div className="mb-6 bg-surface border border-line rounded-lg">
          <div className="px-4 md:px-5 py-3.5 border-b border-line-soft">
            <span className="font-head text-[14.5px] text-ink">Team performance</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[520px]">
              <thead>
                <tr>
                  {["Team", "Members", "Completion", "Overdue", "Trend"].map((h) => (
                    <th key={h} className="text-left px-5 py-2.5 text-[11.5px] text-ink-faint font-medium border-b border-line-soft">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((t) => (
                  <tr key={t.id}>
                    <td className="px-5 py-3 text-[13px] text-ink border-b border-line-soft">{t.name}</td>
                    <td className="px-5 py-3 text-[13px] text-ink-soft border-b border-line-soft tabular-nums">{t.members}</td>
                    <td className="px-5 py-3 border-b border-line-soft">
                      <div className="flex items-center gap-2">
                        <div className="w-[70px] h-[5px] bg-line-soft rounded-[3px]">
                          <div className="h-[5px] bg-primary rounded-[3px]" style={{ width: `${t.completion}%` }} />
                        </div>
                        <span className="text-[12.5px] text-ink-soft">{t.completion}%</span>
                      </div>
                    </td>
                    <td className={`px-5 py-3 text-[13px] border-b border-line-soft ${t.overdue > 5 ? "text-danger" : "text-ink-soft"}`}>{t.overdue}</td>
                    <td className={`px-5 py-3 text-[12.5px] border-b border-line-soft ${t.trend >= 0 ? "text-success" : "text-danger"}`}>
                      {t.trend >= 0 ? `+${t.trend}` : t.trend}pts
                    </td>
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={5} className="px-5 py-6 text-center text-[13px] text-ink-faint">No teams match "{search}".</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="bg-surface border border-line rounded-lg">
          <div className="px-4 md:px-5 py-3.5 border-b border-line-soft">
            <span className="font-head text-[14.5px] text-ink">Skill coverage by team</span>
          </div>
          <div className="p-4 md:p-5 overflow-x-auto">
            {filteredRows.length === 0 || visibleSkills.length === 0 ? (
              <div className="py-4 text-center text-[13px] text-ink-faint">No results for "{search}".</div>
            ) : (
              <div
                className="grid gap-1.5 min-w-[500px] md:min-w-0"
                style={{ gridTemplateColumns: `140px repeat(${visibleSkills.length}, minmax(80px, 96px))` }}
              >
                <div />
                {visibleSkills.map((s) => (
                  <div key={s.id} className="text-[11px] text-ink-faint text-center">{s.name}</div>
                ))}
                {filteredRows.map((t) => (
                  <Fragment key={t.id}>
                    <div className="text-[12.5px] text-ink flex items-center">{t.name}</div>
                    {visibleSkills.map((s) => {
                      const v = heatValue(t.idx, s.i);
                      return (
                        <div key={s.id} className="rounded-[5px] h-[34px] flex items-center justify-center" style={{ background: heatColor(v) }}>
                          <span className={`text-[11.5px] tabular-nums ${v > 55 ? "text-white" : "text-ink"}`}>{v}</span>
                        </div>
                      );
                    })}
                  </Fragment>
                ))}
              </div>
            )}
            <div className="text-[10.5px] text-ink-faint mt-2 md:hidden">Scroll to see all skills →</div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Per-member completion % — same "no real progress tracking yet" placeholder
// pattern as the Org Admin dashboard above, just cycled per team member
// instead of per team. Swap for real numbers once module_progress exists.
const MEMBER_PROGRESS_PATTERN = [40, 75, 90, 20, 60, 85, 15, 55];

function TeamLeadDashboard() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const { data: teamsData } = useTeams();
  const { data: users } = useUsers();

  const myTeam = teamsData?.find((t) => t.name === currentUser?.team_name);
  const myMembers = useMemo(
    () => (users ?? []).filter((u) => u.team_name === currentUser?.team_name),
    [users, currentUser?.team_name],
  );

  const memberCount = myTeam?.member_count ?? myMembers.length;
  // Static, same placeholder convention as the Org Admin dashboard — no
  // per-user completion/overdue tracking exists in the backend yet.
  const completion = 61;
  const trend = -4;
  const overdue = 12;

  return (
    <div className="flex flex-col h-screen min-w-0 flex-1">
      <Topbar title="My Team" />

      <div className="p-5 md:p-8 overflow-auto flex-1">
        <div className="grid gap-3 mb-6 grid-cols-2 md:grid-cols-3">
          <StatBlock label="Team members" value={memberCount} />
          <StatBlock label="Team completion" value={completion} suffix="%" delta={`${trend >= 0 ? "+" : ""}${trend}pts this month`} positive={trend >= 0} />
          <StatBlock label="Overdue trainings" value={overdue} />
        </div>

        {memberCount > 0 && (
          <div className="flex items-start gap-3 px-4 py-4 mb-6 bg-amber-soft border-l-[3px] border-amber rounded-md">
            <Sparkles size={16} className="text-amber mt-0.5 shrink-0" />
            <div className="text-[13px] text-ink-soft">
              2 of {memberCount} learners haven&apos;t started an assigned course in over a week — a nudge is suggested.
            </div>
          </div>
        )}

        <div className="mb-2 flex items-center justify-between">
          <span className="font-head text-[14.5px] text-ink">Your team</span>
          <button
            onClick={() => router.push("/courses")}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-primary rounded-md"
          >
            <Plus size={12} className="text-white" />
            <span className="text-[11.5px] text-white font-medium">Assign course</span>
          </button>
        </div>

        <div className="flex flex-col gap-2">
          {myMembers.map((u, i) => {
            const progress = MEMBER_PROGRESS_PATTERN[i % MEMBER_PROGRESS_PATTERN.length];
            return (
              <div key={u.id} className="flex items-center gap-3 p-3 bg-surface border border-line rounded-lg">
                <div className="w-8 h-8 rounded-full bg-primary-soft flex items-center justify-center shrink-0">
                  <span className="font-head text-[11px] text-primary">
                    {u.name.split(" ").map((n) => n[0]).join("")}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] text-ink font-medium">{u.name}</div>
                  <div className="text-[11.5px] text-ink-faint capitalize">{u.role.replace("_", " ")}</div>
                </div>
                <div className="w-[70px] flex items-center gap-1.5">
                  <div className="flex-1 h-[5px] bg-line-soft rounded-[3px]">
                    <div
                      className={`h-[5px] rounded-[3px] ${progress < 30 ? "bg-danger" : "bg-success"}`}
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
                <span className="text-[11.5px] text-ink-faint w-[34px] text-right">{progress}%</span>
              </div>
            );
          })}
          {myMembers.length === 0 && (
            <div className="text-[12.5px] text-ink-faint">
              No one is on your team yet — ask your Org Admin to add members under Users &amp; Access.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data: currentUser } = useCurrentUser();
  if (currentUser?.role === "team_lead") return <TeamLeadDashboard />;
  return <OrgAdminDashboard />;
}

"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Plus } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { useTeams } from "@/lib/hooks/use-teams";
import { useUsers } from "@/lib/hooks/use-users";
import { useSkills } from "@/lib/hooks/use-skills";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { useLearnerProgress, useTeamSkillCoverage } from "@/lib/hooks/use-progress";
import { heatColor } from "@/lib/sample-data";
import type { AppUser } from "@/lib/types";

function StatBlock({
  label, value, suffix,
}: { label: string; value: string | number; suffix?: string }) {
  return (
    <div className="px-4 py-4 bg-surface border border-line rounded-lg">
      <div className="text-[12px] text-ink-soft">{label}</div>
      <div className="flex items-baseline gap-1.5 mt-1.5">
        <span className="font-head text-[24px] text-ink tabular-nums">{value}</span>
        {suffix && <span className="text-[13px] text-ink-faint">{suffix}</span>}
      </div>
    </div>
  );
}

/** Average progress_pct across a set of learners — 0 if none have anything assigned. */
function avgProgress(members: AppUser[], progressById: Map<string, { progress_pct: number }>): number {
  const pcts = members.map((m) => progressById.get(m.id)?.progress_pct ?? 0);
  return pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
}

function OrgAdminDashboard() {
  const { data: teamsData } = useTeams();
  const { data: users } = useUsers();
  const { data: skillsData } = useSkills();
  const { data: progressData } = useLearnerProgress();
  const { data: coverageData } = useTeamSkillCoverage();
  const [search, setSearch] = useState("");

  const progressById = useMemo(
    () => new Map((progressData ?? []).map((p) => [p.user_id, p])),
    [progressData],
  );
  const coverageByTeam = useMemo(
    () => new Map((coverageData ?? []).map((c) => [c.team_id, c.scores])),
    [coverageData],
  );
  const learnersByTeam = useMemo(() => {
    const map = new Map<string, AppUser[]>();
    for (const u of users ?? []) {
      if (u.role !== "learner" || !u.team_id) continue;
      map.set(u.team_id, [...(map.get(u.team_id) ?? []), u]);
    }
    return map;
  }, [users]);

  const allLearners = (users ?? []).filter((u) => u.role === "learner");
  const activeLearners = allLearners.filter((u) => u.status === "active").length;
  const orgCompletion = avgProgress(allLearners, progressById);
  const notStarted = allLearners.reduce((n, u) => n + (progressById.get(u.id)?.not_started_count ?? 0), 0);

  const teams = teamsData ?? [];
  const skills = (skillsData ?? []).slice(0, 8);

  const rows = teams.map((t) => {
    const members = learnersByTeam.get(t.id) ?? [];
    return { id: t.id, name: t.name, members: t.member_count, completion: avgProgress(members, progressById) };
  });

  // The team furthest behind — a real, computed fact rather than a canned
  // "AI insight": lowest completion among teams that actually have a learner.
  const laggingTeam = rows.filter((r) => r.members > 0).sort((a, b) => a.completion - b.completion)[0];

  const q = search.trim().toLowerCase();
  const teamMatches = (name: string) => name.toLowerCase().includes(q);
  const skillMatch = q ? skills.some((s) => s.name.toLowerCase().includes(q)) : false;

  const filteredRows = !q ? rows : rows.filter((r) => teamMatches(r.name)).length > 0 || !skillMatch
    ? rows.filter((r) => teamMatches(r.name))
    : rows;
  const visibleSkills = !q ? skills : skills.filter((s) => !skillMatch || s.name.toLowerCase().includes(q));

  return (
    <div className="flex flex-col h-screen min-w-0 flex-1">
      <Topbar title="Organization dashboard" search={search} onSearch={setSearch} placeholder="Search teams, skills…" />

      <div className="p-5 md:p-8 overflow-auto flex-1">
        <div className="grid gap-3 mb-6 grid-cols-2 md:grid-cols-3">
          <StatBlock label="Active learners" value={activeLearners} />
          <StatBlock label="Org completion" value={orgCompletion} suffix="%" />
          <StatBlock label="Not started" value={notStarted} />
        </div>

        {laggingTeam && laggingTeam.completion < 100 && (
          <div className="flex items-start gap-3 px-4 py-4 mb-6 bg-primary-soft border-l-[3px] border-primary rounded-md">
            <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
            <div>
              <div className="text-[13px] text-ink font-medium">Lowest completion</div>
              <div className="text-[13px] text-ink-soft mt-0.5">
                {laggingTeam.name} is at {laggingTeam.completion}% average course completion — the lowest of any team with members.
              </div>
            </div>
          </div>
        )}

        <div className="mb-6 bg-surface border border-line rounded-lg">
          <div className="px-4 md:px-5 py-3.5 border-b border-line-soft">
            <span className="font-head text-[14.5px] text-ink">Team performance</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[420px]">
              <thead>
                <tr>
                  {["Team", "Members", "Completion"].map((h) => (
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
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr><td colSpan={3} className="px-5 py-6 text-center text-[13px] text-ink-faint">
                    {teams.length === 0 ? "No teams yet." : `No teams match "${search}".`}
                  </td></tr>
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
              <div className="py-4 text-center text-[13px] text-ink-faint">
                {skills.length === 0 ? "No skills defined yet." : `No results for "${search}".`}
              </div>
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
                      const v = coverageByTeam.get(t.id)?.[s.id] ?? 0;
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

function TeamLeadDashboard() {
  const router = useRouter();
  const { data: currentUser } = useCurrentUser();
  const { data: teamsData } = useTeams();
  const { data: users } = useUsers();
  const { data: progressData } = useLearnerProgress();

  const progressById = useMemo(
    () => new Map((progressData ?? []).map((p) => [p.user_id, p])),
    [progressData],
  );
  const myTeam = teamsData?.find((t) => t.name === currentUser?.team_name);
  const myMembers = useMemo(
    () => (users ?? []).filter((u) => u.team_name === currentUser?.team_name),
    [users, currentUser?.team_name],
  );
  const myLearners = useMemo(() => myMembers.filter((u) => u.role === "learner"), [myMembers]);

  const memberCount = myTeam?.member_count ?? myMembers.length;
  const completion = avgProgress(myLearners, progressById);
  const notStarted = myLearners.reduce((n, u) => n + (progressById.get(u.id)?.not_started_count ?? 0), 0);
  const notStartedLearners = myLearners.filter((u) => {
    const p = progressById.get(u.id);
    return p && p.assigned_count > 0 && p.progress_pct === 0;
  });

  return (
    <div className="flex flex-col h-screen min-w-0 flex-1">
      <Topbar title="My Team" />

      <div className="p-5 md:p-8 overflow-auto flex-1">
        <div className="grid gap-3 mb-6 grid-cols-2 md:grid-cols-3">
          <StatBlock label="Team members" value={memberCount} />
          <StatBlock label="Team completion" value={completion} suffix="%" />
          <StatBlock label="Not started" value={notStarted} />
        </div>

        {notStartedLearners.length > 0 && (
          <div className="flex items-start gap-3 px-4 py-4 mb-6 bg-amber-soft border-l-[3px] border-amber rounded-md">
            <Sparkles size={16} className="text-amber mt-0.5 shrink-0" />
            <div className="text-[13px] text-ink-soft">
              {notStartedLearners.length} of {memberCount} learners haven&apos;t started any assigned course yet — a nudge is suggested.
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
          {myMembers.map((u) => {
            const progress = progressById.get(u.id)?.progress_pct ?? 0;
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
                {u.role === "learner" && (
                  <>
                    <div className="w-[70px] flex items-center gap-1.5">
                      <div className="flex-1 h-[5px] bg-line-soft rounded-[3px]">
                        <div
                          className={`h-[5px] rounded-[3px] ${progress < 30 ? "bg-danger" : "bg-success"}`}
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                    </div>
                    <span className="text-[11.5px] text-ink-faint w-[34px] text-right">{progress}%</span>
                  </>
                )}
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

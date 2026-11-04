"use client";
import { useState } from "react";
import Link from "next/link";
import { Award, ChevronRight, Lock, Sparkles } from "lucide-react";
import { LearnerPage } from "@/components/learner/shell";
import { SkillRadar } from "@/components/learner/widgets";
import { useLearnLeaderboard, useLearnProgress } from "@/lib/hooks/use-learn";
import { badgeCriteriaLabel } from "@/lib/recognition";
import type { BadgeCriteria } from "@/lib/types";
import { cn } from "@/lib/utils";

const medalColor: Record<number, string> = { 1: "#FFC542", 2: "#C7CBDB", 3: "#E0A672" };

function StatsRow({ streak, completed, rank }: { streak: number; completed: number; rank: number }) {
  return (
    <div className="flex items-center justify-around p-4 bg-surface border border-line rounded-xl">
      <div className="text-center">
        <div className="font-head text-[22px] text-ink">{streak}</div>
        <div className="text-[11px] text-ink-faint">Day streak</div>
      </div>
      <div className="w-px h-8 bg-line-soft" />
      <div className="text-center">
        <div className="font-head text-[22px] text-ink">{completed}</div>
        <div className="text-[11px] text-ink-faint">Completed</div>
      </div>
      <div className="w-px h-8 bg-line-soft" />
      <div className="text-center">
        <div className="font-head text-[22px] text-ink">{rank > 0 ? rank : "—"}</div>
        <div className="text-[11px] text-ink-faint">Org rank</div>
      </div>
    </div>
  );
}

function SkillCard({ axes }: { axes: { label: string; value: number }[] }) {
  const weakest = axes.length
    ? axes.reduce((min, a) => (a.value < min.value ? a : min), axes[0])
    : null;
  return (
    <div className="flex flex-col items-center p-4 bg-surface border border-line rounded-xl">
      <div className="flex items-center justify-between w-full mb-1">
        <span className="font-head text-[14.5px] text-ink">Skill profile</span>
      </div>
      {axes.length ? (
        <>
          <SkillRadar axes={axes} />
          {weakest && (
            <div className="flex items-start gap-2 px-3 py-2.5 w-full bg-amber-soft rounded-lg">
              <Sparkles size={13} className="text-amber mt-0.5 shrink-0" />
              <span className="text-[11.5px] text-ink leading-relaxed">
                {weakest.label} is your lowest area — check My Courses for one that builds it.
              </span>
            </div>
          )}
        </>
      ) : (
        <div className="py-8 text-[12.5px] text-ink-faint text-center">
          Complete a few courses to build your skill profile.
        </div>
      )}
    </div>
  );
}

function CertsBlock({ certs }: { certs: { id: string; course_title: string; issued_at: string }[] }) {
  return (
    <div>
      <div className="font-head text-[14.5px] text-ink mb-2.5">Certificates</div>
      <div className="flex flex-col gap-2">
        {certs.map((c) => (
          <Link
            key={c.id} href={`/learn/certificates/${c.id}`}
            className="flex items-center gap-3 p-3 bg-surface border border-line rounded-[10px] active:opacity-80"
          >
            <div className="w-10 h-10 rounded-[9px] bg-amber-soft flex items-center justify-center shrink-0">
              <Award size={18} className="text-amber" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink font-medium truncate">{c.course_title}</div>
              <div className="text-[11px] text-ink-faint">
                Earned {new Date(c.issued_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
              </div>
            </div>
            <ChevronRight size={15} className="text-ink-faint shrink-0" />
          </Link>
        ))}
        <div className="flex items-center gap-3 p-3 border border-dashed border-line rounded-[10px]">
          <div className="w-10 h-10 rounded-[9px] bg-line-soft flex items-center justify-center shrink-0">
            <Lock size={16} className="text-ink-faint" />
          </div>
          <span className="text-[12px] text-ink-faint">Complete an assigned course to unlock a certificate</span>
        </div>
      </div>
    </div>
  );
}

function BadgesBlock({ badges }: { badges: { id: string; name: string; criteria: string; value: string; color: string; earned: boolean }[] }) {
  return (
    <div>
      <div className="font-head text-[14.5px] text-ink mb-2.5">Badges</div>
      {badges.length ? (
        <div className="grid grid-cols-2 gap-2.5">
          {badges.map((b) => (
            <div
              key={b.id}
              className="flex flex-col items-center gap-1.5 p-4 rounded-xl"
              style={{
                background: b.earned ? b.color + "1a" : "var(--color-surface)",
                border: b.earned ? "1px solid transparent" : "1px solid var(--color-line)",
              }}
            >
              <Award size={22} color={b.earned ? b.color : "var(--color-ink-faint)"} />
              <span className={cn("text-[11.5px] text-center font-medium", b.earned ? "text-ink" : "text-ink-soft")}>{b.name}</span>
              <span className="text-[10px] text-ink-faint text-center">
                {badgeCriteriaLabel[b.criteria as BadgeCriteria] ?? b.criteria} {b.value}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="py-8 text-[12.5px] text-ink-faint text-center bg-surface border border-line rounded-xl">
          No badges have been set up for your org yet.
        </div>
      )}
    </div>
  );
}

function LeaderboardTab() {
  const { data: rows = [], isLoading } = useLearnLeaderboard();
  const [teamFilter, setTeamFilter] = useState("All teams");
  const teams = Array.from(new Set(rows.map((r) => r.team_name).filter((t): t is string => !!t)));
  const ranked = rows
    .filter((r) => teamFilter === "All teams" || r.team_name === teamFilter)
    .sort((a, b) => (b.points || 0) - (a.points || 0));

  return (
    <div className="max-w-[560px]">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="text-[12.5px] text-ink-faint max-w-[340px]">
          Ranked by total points — earned from course completions, streaks, and quiz performance.
        </div>
        <select
          value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
          className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-surface shrink-0"
        >
          <option>All teams</option>
          {teams.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>
      {isLoading && <div className="text-[12.5px] text-ink-faint">Loading…</div>}
      <div className="flex flex-col gap-2">
        {ranked.map((u, i) => (
          <div
            key={u.id}
            className={cn("flex items-center gap-3 p-3 bg-surface border rounded-[10px]", u.is_me ? "border-primary" : "border-line")}
          >
            {i < 3 ? (
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: medalColor[i + 1] }}>
                <Award size={14} className="text-white" />
              </div>
            ) : (
              <div className="w-7 text-center shrink-0">
                <span className="font-head text-[13px] text-ink-faint">{i + 1}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-ink font-medium truncate">{u.name}{u.is_me && " (You)"}</div>
              <div className="text-[11px] text-ink-faint truncate">{u.team_name ?? "—"}</div>
            </div>
            <span className="font-head text-[14px] text-ink shrink-0">{(u.points || 0).toLocaleString()}</span>
          </div>
        ))}
        {!isLoading && ranked.length === 0 && <div className="text-[12.5px] text-ink-faint">No one on the leaderboard yet.</div>}
      </div>
    </div>
  );
}

export default function ProgressPage() {
  const [tab, setTab] = useState<"me" | "board">("me");
  const { data: progress, isLoading } = useLearnProgress();

  return (
    <LearnerPage title="Progress">
      <div className="flex p-1 mb-5 bg-line-soft rounded-[10px] w-full md:w-[320px]">
        {([["me", "My progress"], ["board", "Leaderboard"]] as const).map(([id, label]) => (
          <button
            key={id} type="button" onClick={() => setTab(id)}
            className={cn("flex-1 py-2 rounded-lg", tab === id && "bg-surface")}
          >
            <span className={cn("text-[12.5px]", tab === id ? "text-ink font-semibold" : "text-ink-faint")}>{label}</span>
          </button>
        ))}
      </div>

      {tab === "board" ? (
        <LeaderboardTab />
      ) : isLoading || !progress ? (
        <div className="text-[12.5px] text-ink-faint">Loading…</div>
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          <div className="flex flex-col gap-5">
            <StatsRow streak={progress.streak} completed={progress.completed_courses} rank={progress.rank} />
            <SkillCard axes={progress.skills.map((s) => ({ label: s.name, value: s.value }))} />
          </div>
          <div className="flex flex-col gap-5">
            <CertsBlock certs={progress.certificates.map((c) => ({ id: c.id, course_title: c.course_title, issued_at: c.issued_at }))} />
            <BadgesBlock badges={progress.badges} />
          </div>
        </div>
      )}
    </LearnerPage>
  );
}

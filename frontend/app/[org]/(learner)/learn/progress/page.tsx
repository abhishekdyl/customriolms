"use client";
import { useState } from "react";
import Link from "next/link";
import { Award, ChevronRight, Globe2, Lock, MapPin, Sparkles } from "lucide-react";
import { LearnerPage } from "@/components/learner/shell";
import { SkillRadar } from "@/components/learner/widgets";
import { useLearnLeaderboard, useLearnProgress } from "@/lib/hooks/use-learn";
import { usePointLevels } from "@/lib/hooks/use-point-levels";
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
  const { data: levels = [] } = usePointLevels();
  const [teamFilter, setTeamFilter] = useState("All teams");
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [scope, setScope] = useState<"global" | "country">("global");

  const teams = Array.from(new Set(rows.map((r) => r.team_name).filter((t): t is string => !!t)));
  const me = rows.find((r) => r.is_me);
  const fullRanked = [...rows].sort((a, b) => (b.points || 0) - (a.points || 0));
  const myRank = me ? fullRanked.findIndex((r) => r.id === me.id) + 1 : 0;

  // Next tier up from mine — sorted levels ascending by min_points so
  // "the next one up" is just the first one still above my own total.
  const sortedLevels = [...levels].sort((a, b) => a.min_points - b.min_points);
  const nextLevel = sortedLevels.find((lv) => lv.min_points > (me?.points ?? 0));
  const pointsToNext = nextLevel ? nextLevel.min_points - (me?.points ?? 0) : null;

  // A learner only ever sees Global or their own country — not an
  // open-ended country picker, which is an admin-only concern.
  const ranked = rows
    .filter((r) => teamFilter === "All teams" || r.team_name === teamFilter)
    .filter((r) => !tierFilter || r.tier_name === tierFilter)
    .filter((r) => scope === "global" || (!!me?.country && r.country === me.country))
    .sort((a, b) => (b.points || 0) - (a.points || 0));

  return (
    <div className="max-w-[560px]">
      <div className="flex items-center justify-between mb-4 gap-3">
        <div className="text-[12.5px] text-ink-faint max-w-[300px]">
          Ranked by total points — earned per your org's points rules.
        </div>
        <select
          value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}
          className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-surface shrink-0"
        >
          <option>All teams</option>
          {teams.map((t) => <option key={t}>{t}</option>)}
        </select>
      </div>

      {sortedLevels.length > 0 && (
        <div className="flex items-center gap-2 mb-2 overflow-x-auto">
          {sortedLevels.map((lv) => (
            <button
              key={lv.id} type="button" onClick={() => setTierFilter(tierFilter === lv.name ? null : lv.name)}
              className="flex flex-col items-center gap-1 shrink-0" title={lv.name}
            >
              <div
                className="w-10 h-10 rounded-full overflow-hidden flex items-center justify-center"
                style={{ background: lv.color + "22", outline: tierFilter === lv.name ? `2px solid ${lv.color}` : "none" }}
              >
                {lv.image_url ? <img src={lv.image_url} alt={lv.name} className="w-full h-full object-cover" /> : <Award size={16} color={lv.color} />}
              </div>
              <span className="text-[10px] text-ink-faint">{lv.name}</span>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 mb-4 flex-wrap">
        <button type="button" onClick={() => setScope("global")} title="Global" className={cn("flex items-center gap-1 text-[11.5px] px-2 py-1 rounded-md", scope === "global" ? "bg-primary/10 text-primary" : "text-ink-faint")}><Globe2 size={13} /> Global</button>
        <button
          type="button" onClick={() => me?.country && setScope("country")} disabled={!me?.country}
          title={me?.country ? "Country" : "Your country isn't set"}
          className={cn("flex items-center gap-1 text-[11.5px] px-2 py-1 rounded-md disabled:opacity-40", scope === "country" ? "bg-primary/10 text-primary" : "text-ink-faint")}
        >
          <MapPin size={13} /> Country
        </button>
        {tierFilter && (
          <button type="button" onClick={() => { setTierFilter(null); setScope("global"); }} className="text-[11px] text-primary underline ml-1">Clear filter</button>
        )}
      </div>

      {me && (
        <div className="p-4 bg-surface border border-line rounded-xl mb-4">
          <div className="flex items-center gap-4 mb-2">
            <div className="text-[12.5px] text-ink-faint">Your rank: <span className="font-head text-[14px] text-ink">{myRank || "—"}</span></div>
            <div className="flex items-center gap-1 text-[13px] text-ink"><Award size={13} className="text-[#FFC542]" />{me.points.toLocaleString()} Points</div>
          </div>
          {nextLevel && pointsToNext !== null && (
            <>
              <div className="text-[11px] text-ink-faint mb-1">Progress: <span className="font-medium text-ink">{pointsToNext}</span> pts to {nextLevel.name}</div>
              <div className="h-1.5 bg-line-soft rounded-full overflow-hidden">
                <div className="h-full bg-primary" style={{ width: `${Math.min(100, (me.points / nextLevel.min_points) * 100)}%` }} />
              </div>
            </>
          )}
        </div>
      )}

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
              <div className="text-[11px] text-ink-faint truncate">{u.team_name ?? "—"}{u.country ? ` · ${u.country}` : ""}</div>
            </div>
            {u.tier_name && (
              <span className="text-[10.5px] px-2 py-0.5 rounded-full shrink-0" style={{ background: (u.tier_color ?? "#778899") + "22", color: u.tier_color ?? "#778899" }}>
                {u.tier_name}
              </span>
            )}
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

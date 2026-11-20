"use client";
import { useState } from "react";
import { Award, Globe2, MapPin, Settings2 } from "lucide-react";
import { PageLoader } from "@/components/ui/loading";
import { useAdminLeaderboard } from "@/lib/hooks/use-point-rules";
import { usePointLevels } from "@/lib/hooks/use-point-levels";
import { PointsRulesPanel } from "./points-rules-panel";
import { LevelsPanel } from "./levels-panel";

const medal: Record<number, string> = { 0: "#FFC542", 1: "#C7CBDB", 2: "#E0A672" };

function SettingsPanel() {
  // Levels/Tiers is what the admin lands on — Points rules is a step
  // away via the toggle, since levels is the more frequent edit.
  const [tab, setTab] = useState<"levels" | "rules">("levels");
  return (
    <div className="mb-4 bg-surface border border-line rounded-[10px] p-4">
      <div className="flex items-center gap-1 mb-4 border-b border-line pb-2">
        {([["levels", "Levels/Tiers"], ["rules", "Points rules"]] as const).map(([id, label]) => (
          <button
            key={id} type="button" onClick={() => setTab(id)}
            className={`px-2.5 py-1 rounded-md text-[12px] font-medium ${tab === id ? "bg-primary/10 text-primary" : "text-ink-soft"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "levels" && <LevelsPanel />}
      {tab === "rules" && <PointsRulesPanel />}
    </div>
  );
}

export function LeaderboardTab({ query = "" }: { query?: string }) {
  const { data: rows = [], isLoading } = useAdminLeaderboard();
  const { data: levels = [] } = usePointLevels();
  const [tierFilter, setTierFilter] = useState<string | null>(null);
  const [scope, setScope] = useState<"global" | "country">("global");
  const [countryFilter, setCountryFilter] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (isLoading) return <PageLoader />;

  const countries = Array.from(new Set(rows.map((r) => r.country).filter((c): c is string => !!c))).sort();

  const ranked = rows
    .filter((u) => !tierFilter || u.tier_name === tierFilter)
    .filter((u) => scope === "global" || !countryFilter || u.country === countryFilter)
    .filter((u) => u.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  return (
    <div className="max-w-[640px]">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-[12.5px] text-ink-faint max-w-[280px]">
          Ranked by total points — earned per the points rules set below.
        </p>
        <button
          type="button" onClick={() => setSettingsOpen((v) => !v)}
          className="flex items-center gap-1.5 text-[12px] text-ink-soft border border-line rounded-md px-2.5 py-1.5 active:opacity-70 shrink-0"
        >
          <Settings2 size={13} /> Points settings
        </button>
      </div>

      {settingsOpen && <SettingsPanel />}

      {levels.length > 0 && (
        <div className="flex items-center gap-2 mb-2 overflow-x-auto">
          {levels.map((lv) => (
            <button
              key={lv.id} type="button" onClick={() => setTierFilter(tierFilter === lv.name ? null : lv.name)}
              className="flex flex-col items-center gap-1 shrink-0"
              title={lv.name}
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

      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <button type="button" onClick={() => setScope("global")} title="Global" className={`flex items-center gap-1 text-[11.5px] px-2 py-1 rounded-md ${scope === "global" ? "bg-primary/10 text-primary" : "text-ink-faint"}`}><Globe2 size={13} /> Global</button>
        <button type="button" onClick={() => setScope("country")} title="Country" className={`flex items-center gap-1 text-[11.5px] px-2 py-1 rounded-md ${scope === "country" ? "bg-primary/10 text-primary" : "text-ink-faint"}`}><MapPin size={13} /> Country</button>
        {scope === "country" && (
          <select value={countryFilter} onChange={(e) => setCountryFilter(e.target.value)} className="text-[11.5px] border border-line rounded-md px-1.5 py-1 bg-surface">
            <option value="">All countries</option>
            {countries.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {(tierFilter || (scope === "country" && countryFilter)) && (
          <button type="button" onClick={() => { setTierFilter(null); setScope("global"); setCountryFilter(""); }} className="text-[11px] text-primary underline ml-1">Clear filter</button>
        )}
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
              <div className="text-[13px] text-ink font-medium">{u.name}</div>
              <div className="text-[11px] text-ink-faint">{u.team_name ?? "No team"}{u.country ? ` · ${u.country}` : ""}</div>
            </div>
            {u.tier_name && (
              <span className="text-[10.5px] px-2 py-0.5 rounded-full shrink-0" style={{ background: (u.tier_color ?? "#778899") + "22", color: u.tier_color ?? "#778899" }}>
                {u.tier_name}
              </span>
            )}
            <span className="font-head text-[14px] text-ink shrink-0">{u.points.toLocaleString()}</span>
          </div>
        ))}
        {ranked.length === 0 && (
          <div className="p-6 text-center text-[13px] text-ink-faint bg-surface border border-line rounded-[10px]">No learners to rank yet.</div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { AlertCircle, Award, FileText, Target, TrendingUp } from "lucide-react";
import type { ComponentType } from "react";
import { Topbar } from "@/components/shell/topbar";
import { SkillsTab } from "@/components/shell/recognition/skills-tab";
import { BadgesTab } from "@/components/shell/recognition/badges-tab";
import { CertificatesTab } from "@/components/shell/recognition/certificates-tab";
import { LeaderboardTab } from "@/components/shell/recognition/leaderboard-tab";
import { GapAnalysisTab } from "@/components/shell/recognition/gap-tab";

type TabId = "skills" | "badges" | "certificates" | "leaderboard" | "gaps";
const tabs: [TabId, string, ComponentType<{ size?: number; className?: string }>][] = [
  ["skills", "Skills", Target],
  ["badges", "Badges", Award],
  ["certificates", "Certificates", FileText],
  ["leaderboard", "Leaderboard", TrendingUp],
  ["gaps", "Gap analysis", AlertCircle],
];

export default function RecognitionPage() {
  const [tab, setTab] = useState<TabId>("skills");
  const [search, setSearch] = useState("");

  return (
    <div className="flex flex-col h-screen min-w-0 flex-1">
      <Topbar title="Recognition" search={search} onSearch={setSearch} placeholder="Search…" />
      <div className="p-5 md:p-8 overflow-auto flex-1">
        <div className="flex flex-col md:flex-row md:flex-wrap gap-1.5 md:gap-0 p-1 mb-6 bg-line-soft rounded-[10px] w-full md:w-[620px]">
          {tabs.map(([id, label, Icon]) => (
            <button
              key={id} type="button" onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg min-w-full md:min-w-[110px] ${tab === id ? "bg-surface" : ""}`}
            >
              <Icon size={13} className={tab === id ? "text-primary" : "text-ink-faint"} />
              <span className={`text-[12.5px] ${tab === id ? "text-ink font-semibold" : "text-ink-faint"}`}>{label}</span>
            </button>
          ))}
        </div>
        {tab === "skills" && <SkillsTab query={search} />}
        {tab === "badges" && <BadgesTab query={search} />}
        {tab === "certificates" && <CertificatesTab />}
        {tab === "leaderboard" && <LeaderboardTab query={search} />}
        {tab === "gaps" && <GapAnalysisTab />}
      </div>
    </div>
  );
}

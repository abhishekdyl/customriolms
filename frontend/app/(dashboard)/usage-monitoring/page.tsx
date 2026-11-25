"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useOrgUsageList, useServerHealth } from "@/lib/hooks/use-usage-monitoring";
import { ServerHealthCard } from "@/components/shell/usage/server-health-card";
import { OrgUsageTable } from "@/components/shell/usage/org-usage-table";

export default function UsageMonitoringPage() {
  const { data: health, isLoading: healthLoading } = useServerHealth();
  const { data: orgs = [], isLoading: orgsLoading } = useOrgUsageList();
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    if (!search.trim()) return orgs;
    const q = search.trim().toLowerCase();
    return orgs.filter((o) => o.org_name.toLowerCase().includes(q) || o.org_slug.toLowerCase().includes(q));
  }, [orgs, search]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-head text-xl text-ink">Usage Monitoring</h1>
          <p className="mt-0.5 text-sm text-ink-faint">Storage, load, and activity across every organization on the platform.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input placeholder="Search org…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-52 pl-8 text-xs" />
        </div>
      </div>

      <div className="mb-6">
        {healthLoading ? (
          <p className="text-[12.5px] text-ink-faint">Checking server health…</p>
        ) : health ? (
          <ServerHealthCard health={health} />
        ) : null}
      </div>

      {orgsLoading ? (
        <p className="text-[12.5px] text-ink-faint">Loading organizations…</p>
      ) : (
        <OrgUsageTable rows={shown} />
      )}
    </div>
  );
}

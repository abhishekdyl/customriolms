"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { OrgUsage, OrgUsageDetail, ServerHealth } from "@/lib/types";

const BASE = "/api/v1/usage-monitoring";

/** Live, not polled automatically — the page's own refresh button
 * re-fetches this (see usage-monitoring/page.tsx), since CPU/RAM/disk
 * change by the second and a stale reading would be misleading. */
export function useServerHealth() {
  return useQuery({
    queryKey: ["server-health"],
    queryFn: () => api.get<ServerHealth>(`${BASE}/server-health`),
    refetchInterval: 15_000,
  });
}

export function useOrgUsageList() {
  return useQuery({
    queryKey: ["org-usage"],
    queryFn: () => api.get<OrgUsage[]>(`${BASE}/orgs`),
    refetchInterval: 30_000,
  });
}

export function useOrgUsageDetail(orgId: string, days: number) {
  return useQuery({
    queryKey: ["org-usage-detail", orgId, days],
    queryFn: () => api.get<OrgUsageDetail>(`${BASE}/orgs/${orgId}?days=${days}`),
    enabled: !!orgId,
  });
}

"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { LeaderRow } from "@/lib/learn";

export type RuleScope = "course" | "module";
export type RuleEvent = "start" | "complete";

export interface PointRule {
  id: string;
  scope: RuleScope;
  event: RuleEvent;
  points: number;
  course_id: string;
  course_title: string;
  module_id: string | null;
  module_title: string | null;
  module_type: string | null;
}

/** Recognition page's Leaderboard tab, "Points settings" — every rule
 * an Org Admin has set, course- or module-scoped. */
export function usePointRules() {
  return useQuery({ queryKey: ["point-rules"], queryFn: () => api.get<PointRule[]>("/api/v1/point-rules") });
}

export function useUpsertPointRule() {
  const qc = useQueryClient();
  return useMutation({
    // Re-submitting the same (scope, course_id/module_id, event) just
    // updates that rule's points in place — no separate "edit" endpoint.
    mutationFn: (body: { scope: RuleScope; course_id?: string; module_id?: string; event: RuleEvent; points: number }) =>
      api.post<PointRule>("/api/v1/point-rules", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["point-rules"] }),
  });
}

export function useDeletePointRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ruleId: string) => api.delete(`/api/v1/point-rules/${ruleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["point-rules"] }),
  });
}

/** The real, points-engine-backed ranking — same data a learner's own
 * Progress > Leaderboard tab shows, just reachable here too (that
 * endpoint is gated to the LEARNER role only). */
export function useAdminLeaderboard() {
  return useQuery({ queryKey: ["point-rules", "leaderboard"], queryFn: () => api.get<LeaderRow[]>("/api/v1/point-rules/leaderboard") });
}

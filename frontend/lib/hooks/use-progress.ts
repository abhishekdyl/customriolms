"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

/** One learner's rolled-up progress — real numbers behind the Org Admin /
 * Team Lead dashboards. From GET /api/v1/users/progress. */
export interface LearnerProgress {
  user_id: string;
  progress_pct: number;
  assigned_count: number;
  not_started_count: number;
}

export function useLearnerProgress() {
  return useQuery({
    queryKey: ["users", "progress"],
    queryFn: () => api.get<LearnerProgress[]>("/api/v1/users/progress"),
  });
}

/** One team's average %-built per skill. From GET /api/v1/teams/skill-coverage
 * (Org Admin only). */
export interface TeamSkillCoverage {
  team_id: string;
  scores: Record<string, number>; // skill_id -> avg pct
}

export function useTeamSkillCoverage() {
  return useQuery({
    queryKey: ["teams", "skill-coverage"],
    queryFn: () => api.get<TeamSkillCoverage[]>("/api/v1/teams/skill-coverage"),
  });
}

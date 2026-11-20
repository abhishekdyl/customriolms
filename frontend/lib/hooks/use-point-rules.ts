"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { LeaderRow } from "@/lib/learn";

export interface CoursePoints {
  course_id: string;
  title: string;
  points: number;
  is_override: boolean; // false = this is the org's own default, not a rule of its own
}

export interface ModulePoints {
  module_id: string;
  course_id: string;
  title: string;
  type: string;
  points: number;
  is_override: boolean;
}

/** Recognition page's Leaderboard tab, "Points settings" — every course
 * in this org with what its certificate is currently worth. */
export function useCoursePoints() {
  return useQuery({ queryKey: ["point-rules", "courses"], queryFn: () => api.get<CoursePoints[]>("/api/v1/point-rules/courses") });
}

export function useSetCoursePoints() {
  const qc = useQueryClient();
  return useMutation({
    // points: null clears the override, reverting to the org's own default.
    mutationFn: ({ courseId, points }: { courseId: string; points: number | null }) =>
      api.put<CoursePoints>(`/api/v1/point-rules/courses/${courseId}`, { points }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["point-rules"] }),
  });
}

/** Every module in one course with what completing it is currently
 * worth (works for any module type, including SCORM). */
export function useModulePoints(courseId: string | null) {
  return useQuery({
    queryKey: ["point-rules", "modules", courseId],
    queryFn: () => api.get<ModulePoints[]>(`/api/v1/point-rules/modules?course_id=${courseId}`),
    enabled: !!courseId,
  });
}

export function useSetModulePoints() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, points }: { moduleId: string; points: number | null }) =>
      api.put<ModulePoints>(`/api/v1/point-rules/modules/${moduleId}`, { points }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["point-rules"] }),
  });
}

/** The real, points-engine-backed ranking — same data the learner's own
 * Progress > Leaderboard tab shows, just reachable here too (the
 * learner-facing endpoint is gated to the LEARNER role only). */
export function useAdminLeaderboard() {
  return useQuery({ queryKey: ["point-rules", "leaderboard"], queryFn: () => api.get<LeaderRow[]>("/api/v1/point-rules/leaderboard") });
}

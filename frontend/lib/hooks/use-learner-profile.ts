"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { LearnerProfile } from "@/lib/types";

/** The learner-only extended profile (GET/PATCH /api/v1/learn/profile) —
 * separate from /auth/me (use-auth.ts's useCurrentUser), which only ever
 * carries name/email/role/team. Org Admin/Team Lead never call this. */
export function useLearnerProfile() {
  return useQuery({
    queryKey: ["learner-profile"],
    queryFn: () => api.get<LearnerProfile>("/api/v1/learn/profile"),
  });
}

export function useUpdateLearnerProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<LearnerProfile, "phone" | "job_title" | "location" | "bio" | "country">>) =>
      api.patch<LearnerProfile>("/api/v1/learn/profile", body),
    onSuccess: (data) => qc.setQueryData(["learner-profile"], data),
  });
}

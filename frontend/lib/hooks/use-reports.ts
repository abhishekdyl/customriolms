"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Reports } from "@/lib/types";

/** The whole Reports & Analytics page in one call — org-wide (or,
 * for a Team Lead, team-scoped) overview numbers, a per-course
 * performance table, and a short activity trend. Org Admin / Team Lead. */
export function useReports(days: number = 14) {
  return useQuery({
    queryKey: ["reports", days],
    queryFn: () => api.get<Reports>(`/api/v1/reports?days=${days}`),
  });
}

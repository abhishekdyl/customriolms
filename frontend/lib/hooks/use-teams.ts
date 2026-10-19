"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Team } from "@/lib/types";

export function useTeams() {
  return useQuery({ queryKey: ["teams"], queryFn: () => api.get<Team[]>("/api/v1/teams") });
}

export function useCreateTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<Team>("/api/v1/teams", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
}

export function useRenameTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => api.patch<Team>(`/api/v1/teams/${id}`, { name }),
    // AppUser carries a denormalized team_name — a rename here must
    // invalidate the users list too, or Users & Access / the dashboard
    // keeps showing the old team name until something else refreshes it.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

export function useDeleteTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/teams/${id}`),
    // Deleting a team un-assigns its members (team_name -> null for them)
    // and drops it from any course's assigned_team_count.
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["teams"] });
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

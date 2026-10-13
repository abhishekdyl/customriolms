"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Badge, BadgeCriteria } from "@/lib/types";

type BadgeBody = { name: string; criteria: BadgeCriteria; value: string; color: string };

export function useBadges() {
  return useQuery({ queryKey: ["badges"], queryFn: () => api.get<Badge[]>("/api/v1/badges") });
}

export function useCreateBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: BadgeBody) => api.post<Badge>("/api/v1/badges", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["badges"] }),
  });
}

export function useUpdateBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: BadgeBody & { id: string }) => api.patch<Badge>(`/api/v1/badges/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["badges"] }),
  });
}

export function useDeleteBadge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/badges/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["badges"] }),
  });
}

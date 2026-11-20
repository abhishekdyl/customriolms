"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface PointLevel {
  id: string;
  name: string;
  min_points: number;
  max_points: number | null; // null = open-ended ("and above") — e.g. the top tier
  color: string;
  sort_order: number;
  image_url: string | null;
}

export type PointLevelDraft = { name: string; min_points: number; max_points: number | null; color: string; sort_order: number };

/** Recognition page's Leaderboard tab, "Levels/Tiers" — every org
 * member can read this (it's what the leaderboard's own tier
 * chips/column need), only leaderboard.manage can write it. */
export function usePointLevels() {
  return useQuery({ queryKey: ["point-levels"], queryFn: () => api.get<PointLevel[]>("/api/v1/point-levels") });
}

export function useCreatePointLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: PointLevelDraft) => api.post<PointLevel>("/api/v1/point-levels", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["point-levels"] }),
  });
}

export function useUpdatePointLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: PointLevelDraft & { id: string }) => api.patch<PointLevel>(`/api/v1/point-levels/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["point-levels"] }),
  });
}

export function useDeletePointLevel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/point-levels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["point-levels"] }),
  });
}

export function useUploadPointLevelImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<PointLevel>(`/api/v1/point-levels/${id}/image`, formData);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["point-levels"] }),
  });
}

export function useRemovePointLevelImage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/point-levels/${id}/image`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["point-levels"] }),
  });
}

"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { LiveClass, LiveClassInput, LiveClassJoin, LiveClassProvider } from "@/lib/types";

const base = "/api/v1/live-classes";

// ----- admin/instructor side (gated server-side on live_classes.manage)
export function useLiveClassProviders() {
  return useQuery({ queryKey: ["live-classes-providers"], queryFn: () => api.get<LiveClassProvider[]>(`${base}/providers`) });
}
export function useLiveClasses() {
  return useQuery({ queryKey: ["live-classes"], queryFn: () => api.get<LiveClass[]>(base) });
}
export function useCreateLiveClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: LiveClassInput) => api.post<LiveClass>(base, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live-classes"] }),
  });
}
export function useUpdateLiveClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: LiveClassInput & { id: string }) => api.patch<LiveClass>(`${base}/${id}`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live-classes"] }),
  });
}
export function useDeleteLiveClass() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${base}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["live-classes"] }),
  });
}

// ----- every org member's own view, powers the learner Calendar page
export function useMyLiveClasses() {
  return useQuery({ queryKey: ["live-classes-mine"], queryFn: () => api.get<LiveClass[]>(`${base}/mine`) });
}
export function useJoinLiveClass() {
  return useMutation({ mutationFn: (id: string) => api.post<LiveClassJoin>(`${base}/${id}/join`, {}) });
}

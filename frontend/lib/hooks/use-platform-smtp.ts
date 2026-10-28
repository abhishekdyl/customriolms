"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { OrgFallbackRequest, PlatformSmtpSettings } from "@/lib/notifications";

const base = "/api/v1/platform/smtp";

export function usePlatformSmtp() {
  return useQuery({ queryKey: ["platform-smtp"], queryFn: () => api.get<PlatformSmtpSettings>(base) });
}
export function useSavePlatformSmtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Omit<PlatformSmtpSettings, "has_password"> & { password?: string }) => api.patch<PlatformSmtpSettings>(base, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-smtp"] }),
  });
}
export function useTestPlatformSmtp() {
  return useMutation({ mutationFn: () => api.post<{ ok: boolean; detail: string }>(`${base}/test`, {}) });
}

// ----- org ▸ platform-fallback requests (Super Admin's approval queue)
export function usePlatformSmtpRequests() {
  return useQuery({ queryKey: ["platform-smtp-requests"], queryFn: () => api.get<OrgFallbackRequest[]>(`${base}/requests`) });
}
export function useDecideSmtpRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ orgId, approve }: { orgId: string; approve: boolean }) =>
      api.post<OrgFallbackRequest>(`${base}/requests/${orgId}/${approve ? "approve" : "deny"}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["platform-smtp-requests"] }),
  });
}

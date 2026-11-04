"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Org, OrgPlan, OrgStatus, PlatformSettings, PlatformStatus, SuperAdmin } from "@/lib/types";

export function useOrgs() {
  return useQuery({ queryKey: ["orgs"], queryFn: () => api.get<Org[]>("/api/v1/orgs") });
}

export function useMyOrg(enabled: boolean = true) {
  // Any authenticated user can read their own org's basics — this is what
  // the Users & Access page uses for the seat-limit banner, the domain
  // restriction copy on the invite form, and the org slug for the QR/join link.
  // `enabled` lets Super Admin (not a member of any customer org) skip this
  // call entirely rather than hitting a 404/wrong-org response.
  return useQuery({ queryKey: ["orgs", "me"], queryFn: () => api.get<Org>("/api/v1/orgs/me"), enabled });
}

export function useUpdateMyOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name?: string; slug?: string; industry?: string; timezone?: string; contact_email?: string | null; allow_custom_username?: boolean }) =>
      api.patch<Org>("/api/v1/orgs/me", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs", "me"] }),
  });
}

export function useDeactivateMyOrg() {
  const qc = useQueryClient();
  return useMutation({
    // Ends every active session org-wide, including the admin who just
    // clicked this — see orgs.py's deactivate_my_org. Nothing to
    // invalidate afterward since the token doing the asking is dead too.
    mutationFn: () => api.post<Org>("/api/v1/orgs/me/deactivate"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs", "me"] }),
  });
}

export function useCreateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { org_name: string; plan: OrgPlan; admin_name: string; admin_email: string; admin_password: string }) =>
      api.post<Org>("/api/v1/orgs", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs"] }),
  });
}

export function useUpdateOrgStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: OrgStatus }) =>
      api.patch<Org>(`/api/v1/orgs/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs"] }),
  });
}

export function useUpdateOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; plan?: OrgPlan; user_limit?: number }) =>
      api.patch<Org>(`/api/v1/orgs/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs"] }),
  });
}

/** Super Admin editing this org's Org Admin (name/email/temporary
 * password) from the Organizations page — see orgs.py's
 * update_org_admin for why this needs its own endpoint rather than
 * /users/{id}/profile. Every field optional; omit what you're not
 * changing. */
export function useUpdateOrgAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; email?: string; password?: string }) =>
      api.patch<Org>(`/api/v1/orgs/${id}/admin`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs"] }),
  });
}

export function useDeleteOrg() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/orgs/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["orgs"] }),
  });
}

export function usePlatformSettings() {
  return useQuery({ queryKey: ["platform-settings"], queryFn: () => api.get<PlatformSettings>("/api/v1/orgs/platform-settings") });
}

export function useUpdatePlatformSettings() {
  const qc = useQueryClient();
  return useMutation({
    // Partial — the backend merges only whatever's present (see
    // update_platform_settings), so a tab that only cares about one
    // field never clobbers what another tab last saved.
    mutationFn: (body: Partial<PlatformSettings>) => api.patch<PlatformSettings>("/api/v1/orgs/platform-settings", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-settings"] });
      qc.invalidateQueries({ queryKey: ["platform-status"] });
    },
  });
}

export function useSuperAdmins() {
  return useQuery({ queryKey: ["super-admins"], queryFn: () => api.get<SuperAdmin[]>("/api/v1/orgs/super-admins") });
}

/** Public, unauthenticated — safe to call before login (MaintenanceGate
 * uses it to decide whether to show the maintenance page at all) and on
 * every page while logged in (DebugBar uses it to decide whether to show
 * the debug banner). Polls periodically so a Super Admin flipping the
 * switch takes effect for everyone else without a refresh. */
export function usePlatformStatus() {
  return useQuery({
    queryKey: ["platform-status"],
    queryFn: () => api.get<PlatformStatus>("/api/v1/orgs/platform-status"),
    retry: false,
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
}

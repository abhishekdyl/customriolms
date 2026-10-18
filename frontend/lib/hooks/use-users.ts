"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser, BulkInviteResult, RoleName } from "@/lib/types";

export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: () => api.get<AppUser[]>("/api/v1/users") });
}

/** One user's full profile — the Org Admin / Team Lead "view profile" panel. */
export function useUser(userId: string | null) {
  return useQuery({
    queryKey: ["users", userId],
    queryFn: () => api.get<AppUser>(`/api/v1/users/${userId}`),
    enabled: !!userId,
  });
}

/** The Org-Admin-only "edit profile" form — full name/email/role are
 * mandatory (same trio required at creation); team and the rest are
 * optional extras left untouched when omitted. */
export function useUpdateUserProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: {
      id: string; name: string; email: string; role: RoleName; team_id: string | null;
      phone?: string | null; job_title?: string | null; location?: string | null; bio?: string | null; country?: string | null;
    }) => api.patch<AppUser>(`/api/v1/users/${id}/profile`, body),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: ["users"] });
      qc.setQueryData(["users", updated.id], updated);
    },
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; email: string; team_id: string | null; role: RoleName }) =>
      api.post<AppUser>("/api/v1/users/invite", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useBulkInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<BulkInviteResult>("/api/v1/users/bulk-invite", formData);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useChangeRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: RoleName }) => api.patch(`/api/v1/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useChangeTeam() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, team_id }: { id: string; team_id: string | null }) => api.patch(`/api/v1/users/${id}/team`, { team_id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useUpdateUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: "active" | "suspended" }) => api.patch(`/api/v1/users/${id}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/users/${id}`), // soft delete on the backend — status becomes deactivated
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

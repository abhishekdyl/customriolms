"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AppUser, BulkInviteResult, RoleName } from "@/lib/types";

export function useUsers() {
  return useQuery({ queryKey: ["users"], queryFn: () => api.get<AppUser[]>("/api/v1/users") });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { email: string; team_id: string | null }) => api.post<AppUser>("/api/v1/users/invite", body),
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

"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CapabilityGroup, CustomRole } from "@/lib/types";

/** The fixed catalog every custom role's capabilities are picked from —
 * grouped for the "Define role" checkbox list. Same for every org, so
 * it's fine to treat as effectively static (long staleTime). */
export function useCapabilityCatalog() {
  return useQuery({
    queryKey: ["custom-roles", "capabilities"],
    queryFn: () => api.get<CapabilityGroup[]>("/api/v1/custom-roles/capabilities"),
    staleTime: Infinity,
  });
}

export function useCustomRoles() {
  return useQuery({
    queryKey: ["custom-roles"],
    queryFn: () => api.get<CustomRole[]>("/api/v1/custom-roles"),
  });
}

export function useCreateCustomRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; description: string; scope: "org" | "own_team"; capabilities: string[] }) =>
      api.post<CustomRole>("/api/v1/custom-roles", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-roles"] }),
  });
}

export function useUpdateCustomRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, ...body }: { roleId: string; name?: string; description?: string; scope?: "org" | "own_team"; capabilities?: string[] }) =>
      api.patch<CustomRole>(`/api/v1/custom-roles/${roleId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-roles"] }),
  });
}

export function useDeleteCustomRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => api.delete(`/api/v1/custom-roles/${roleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["custom-roles"] }),
  });
}

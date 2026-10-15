"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { ProfileField, ProfileFieldType, ProfileFieldValue } from "@/lib/types";

/** Org Admin's field definitions — GET/POST/PATCH/DELETE /api/v1/org-profile-fields. */
export function useProfileFields() {
  return useQuery({
    queryKey: ["org-profile-fields"],
    queryFn: () => api.get<ProfileField[]>("/api/v1/org-profile-fields"),
  });
}

export function useCreateProfileField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { shortname: string; name: string; field_type: ProfileFieldType; options?: string[]; required?: boolean }) =>
      api.post<ProfileField>("/api/v1/org-profile-fields", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-profile-fields"] }),
  });
}

export function useUpdateProfileField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; name?: string; options?: string[]; required?: boolean; sortorder?: number }) =>
      api.patch<ProfileField>(`/api/v1/org-profile-fields/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-profile-fields"] }),
  });
}

export function useDeleteProfileField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/org-profile-fields/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["org-profile-fields"] }),
  });
}

/** The current user's own custom field values — GET/PATCH /api/v1/auth/me/custom-fields. */
export function useMyCustomFields() {
  return useQuery({
    queryKey: ["my-custom-fields"],
    queryFn: () => api.get<ProfileFieldValue[]>("/api/v1/auth/me/custom-fields"),
  });
}

export function useUpdateMyCustomFields() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (values: Record<string, string | null>) =>
      api.patch<ProfileFieldValue[]>("/api/v1/auth/me/custom-fields", { values }),
    onSuccess: (data) => qc.setQueryData(["my-custom-fields"], data),
  });
}

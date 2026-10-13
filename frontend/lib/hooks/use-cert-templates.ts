"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CertTemplate } from "@/lib/types";
import type { IssuedCertificate } from "@/lib/recognition";

export type CertTemplateBody = Partial<Omit<CertTemplate, "id">>;

export function useCertTemplates() {
  return useQuery({ queryKey: ["cert-templates"], queryFn: () => api.get<CertTemplate[]>("/api/v1/certificates/templates") });
}

export function useCreateCertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CertTemplateBody & { name: string }) => api.post<CertTemplate>("/api/v1/certificates/templates", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cert-templates"] }),
  });
}

export function useUpdateCertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: CertTemplateBody & { id: string }) => api.patch<CertTemplate>(`/api/v1/certificates/templates/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cert-templates"] }),
  });
}

export function useDeleteCertTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/certificates/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cert-templates"] }),
  });
}

export function useIssuedCertificates() {
  return useQuery({ queryKey: ["certificates"], queryFn: () => api.get<IssuedCertificate[]>("/api/v1/certificates") });
}

export function useRevokeCertificate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/certificates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["certificates"] }),
  });
}

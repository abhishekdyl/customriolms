"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  BroadcastPreview, BroadcastResult, BroadcastTarget, EmailLogEntry, NotifTemplate, ReminderRule, SmtpSettings,
  WhatsAppLogEntry, WhatsAppSettings, WhatsAppTemplate,
} from "@/lib/notifications";

const base = "/api/v1/notifications";

// ----- templates
export function useTemplates() {
  return useQuery({ queryKey: ["notif-templates"], queryFn: () => api.get<NotifTemplate[]>(`${base}/templates`) });
}
export function useCreateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { name: string; subject: string; body: string }) => api.post<NotifTemplate>(`${base}/templates`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-templates"] }),
  });
}
export function useUpdateTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: { id: string; name: string; subject: string; body: string }) => api.patch<NotifTemplate>(`${base}/templates/${id}`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-templates"] }),
  });
}
export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${base}/templates/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-templates"] }),
  });
}

// ----- rules
type RuleBody = Omit<ReminderRule, "id">;
export function useRules() {
  return useQuery({ queryKey: ["notif-rules"], queryFn: () => api.get<ReminderRule[]>(`${base}/rules`) });
}
export function useCreateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: RuleBody) => api.post<ReminderRule>(`${base}/rules`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-rules"] }),
  });
}
export function useUpdateRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...b }: ReminderRule) => api.patch<ReminderRule>(`${base}/rules/${id}`, b),
    // optimistic so toggles/selects feel instant
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: ["notif-rules"] });
      const prev = qc.getQueryData<ReminderRule[]>(["notif-rules"]);
      qc.setQueryData<ReminderRule[]>(["notif-rules"], (old) => old?.map((r) => (r.id === next.id ? next : r)));
      return { prev };
    },
    onError: (_e, _v, ctx) => ctx?.prev && qc.setQueryData(["notif-rules"], ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: ["notif-rules"] }),
  });
}
export function useDeleteRule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${base}/rules/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-rules"] }),
  });
}

// ----- smtp
export function useSmtp() {
  return useQuery({ queryKey: ["notif-smtp"], queryFn: () => api.get<SmtpSettings>(`${base}/smtp`) });
}
export function useSaveSmtp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: Omit<SmtpSettings, "has_password" | "fallback_status"> & { password?: string }) => api.patch<SmtpSettings>(`${base}/smtp`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-smtp"] }),
  });
}
export function useTestSmtp() {
  return useMutation({ mutationFn: () => api.post<{ ok: boolean; detail: string }>(`${base}/smtp/test`, {}) });
}
export function useRequestPlatformFallback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<SmtpSettings>(`${base}/smtp/request-platform-fallback`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-smtp"] }),
  });
}
export function useEmailLog() {
  return useQuery({ queryKey: ["notif-email-log"], queryFn: () => api.get<EmailLogEntry[]>(`${base}/smtp/log`) });
}

// ----- WhatsApp -----
export function useWhatsAppSettings() {
  return useQuery({ queryKey: ["notif-whatsapp"], queryFn: () => api.get<WhatsAppSettings>(`${base}/whatsapp`) });
}
export function useSaveWhatsAppSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { enabled: boolean; api_key?: string; from_number: string }) => api.patch<WhatsAppSettings>(`${base}/whatsapp`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-whatsapp"] }),
  });
}
export function useTestWhatsApp() {
  return useMutation({ mutationFn: () => api.post<{ ok: boolean; detail: string }>(`${base}/whatsapp/test`, {}) });
}
export function useWhatsAppTemplates() {
  return useQuery({ queryKey: ["notif-whatsapp-templates"], queryFn: () => api.get<WhatsAppTemplate[]>(`${base}/whatsapp/templates`) });
}
export function useSaveWhatsAppTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: WhatsAppTemplate) => api.patch<WhatsAppTemplate>(`${base}/whatsapp/templates`, b),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notif-whatsapp-templates"] }),
  });
}
export function useWhatsAppLog() {
  return useQuery({ queryKey: ["notif-whatsapp-log"], queryFn: () => api.get<WhatsAppLogEntry[]>(`${base}/whatsapp/log`) });
}

// ----- WhatsApp broadcast (Course Launch / Webinar "Notify via WhatsApp") -----
export function usePreviewCourseLaunch(courseId: string) {
  return useMutation({ mutationFn: (b: BroadcastTarget) => api.post<BroadcastPreview>(`/api/v1/courses/${courseId}/notify-whatsapp/preview`, b) });
}
export function useSendCourseLaunch(courseId: string) {
  return useMutation({ mutationFn: (b: BroadcastTarget) => api.post<BroadcastResult>(`/api/v1/courses/${courseId}/notify-whatsapp`, b) });
}
export function usePreviewWebinarNotify(liveClassId: string) {
  return useMutation({ mutationFn: (b: BroadcastTarget) => api.post<BroadcastPreview>(`/api/v1/live-classes/${liveClassId}/notify-whatsapp/preview`, b) });
}
export function useSendWebinarNotify(liveClassId: string) {
  return useMutation({ mutationFn: (b: BroadcastTarget) => api.post<BroadcastResult>(`/api/v1/live-classes/${liveClassId}/notify-whatsapp`, b) });
}

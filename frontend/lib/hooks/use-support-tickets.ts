"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  SupportTicket, SupportTicketMessage, SupportTicketCategory, SupportTicketPriority, SupportTicketStatus,
} from "@/lib/types";

const BASE = "/api/v1/support-tickets";

export interface SupportTicketFilters {
  status?: SupportTicketStatus;
  category?: SupportTicketCategory;
  priority?: SupportTicketPriority;
  org_id?: string;
}

function toQuery(filters?: SupportTicketFilters): string {
  if (!filters) return "";
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.category) params.set("category", filters.category);
  if (filters.priority) params.set("priority", filters.priority);
  if (filters.org_id) params.set("org_id", filters.org_id);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Used by both sides: an Org Admin gets back only their own org's
 * tickets (filters are ignored server-side for them); a Super Admin
 * gets the full cross-org queue, filtered by whatever's passed. */
export function useSupportTickets(filters?: SupportTicketFilters) {
  return useQuery({
    queryKey: ["support-tickets", filters],
    queryFn: () => api.get<SupportTicket[]>(`${BASE}${toQuery(filters)}`),
  });
}

export function useCreateSupportTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { subject: string; body: string; category: SupportTicketCategory; priority: SupportTicketPriority }) =>
      api.post<SupportTicket>(BASE, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tickets"] }),
  });
}

export function useSupportTicketMessages(ticketId: string) {
  return useQuery({
    queryKey: ["support-ticket-messages", ticketId],
    queryFn: () => api.get<SupportTicketMessage[]>(`${BASE}/${ticketId}/messages`),
    enabled: !!ticketId,
  });
}

export function useReplySupportTicket(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post<SupportTicketMessage>(`${BASE}/${ticketId}/messages`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["support-ticket-messages", ticketId] });
      qc.invalidateQueries({ queryKey: ["support-tickets"] });
    },
  });
}

export function useSetSupportTicketStatus(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: SupportTicketStatus) => api.patch<SupportTicket>(`${BASE}/${ticketId}/status`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["support-tickets"] }),
  });
}

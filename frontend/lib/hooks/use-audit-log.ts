"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { AuditLogEntry } from "@/lib/types";

/** "Kisne kya badla, kab" — every course create/publish/update/delete and
 * user role change in this org, newest first. Org Admin only.
 * `action` narrows to one family (e.g. "course" or "user") without the
 * caller needing to know the exact action strings the backend emits. */
export function useAuditLog(action?: string) {
  return useQuery({
    queryKey: ["audit-log", action ?? "all"],
    queryFn: () => api.get<AuditLogEntry[]>(`/api/v1/audit-log${action ? `?action=${encodeURIComponent(action)}` : ""}`),
  });
}

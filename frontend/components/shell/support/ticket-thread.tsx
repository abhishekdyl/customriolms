"use client";
import { useState } from "react";
import { CheckCircle2, Loader2, RotateCcw, Send, ShieldCheck } from "lucide-react";
import {
  useReplySupportTicket, useSetSupportTicketStatus, useSupportTicketMessages,
} from "@/lib/hooks/use-support-tickets";
import type { SupportTicket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategoryBadge, PriorityBadge, StatusBadge } from "./ticket-badges";

/** The right-hand detail pane of the support-ticket master/detail
 * layout — same component for both the Org Admin's own Support page
 * and the Super Admin's cross-org queue. A message bubble leans right
 * and goes primary-colored when its author is a Super Admin, left and
 * neutral otherwise, so a conversation reads like a normal chat thread
 * regardless of which side is viewing it. */
export function TicketThread({ ticket, showOrg = false }: { ticket: SupportTicket; showOrg?: boolean }) {
  const { data: messages = [], isLoading } = useSupportTicketMessages(ticket.id);
  const reply = useReplySupportTicket(ticket.id);
  const setStatus = useSetSupportTicketStatus(ticket.id);
  const [draft, setDraft] = useState("");

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    reply.mutate(body, { onSuccess: () => setDraft("") });
  };

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="border-b border-line-soft px-5 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-[15px] font-semibold text-ink">{ticket.subject}</h2>
            <p className="mt-0.5 text-[11.5px] text-ink-faint">
              {showOrg && <span className="font-medium text-ink-soft">{ticket.org_name}</span>}
              {showOrg && " · "}
              {ticket.raised_by_name ?? "Unknown"} · opened {new Date(ticket.created_at).toLocaleDateString()}
            </p>
          </div>
          <button
            type="button" disabled={setStatus.isPending}
            onClick={() => setStatus.mutate(ticket.status === "open" ? "resolved" : "open")}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-medium disabled:opacity-50",
              ticket.status === "open" ? "bg-success text-white" : "border border-line text-ink-soft"
            )}
          >
            {ticket.status === "open" ? <CheckCircle2 size={13} /> : <RotateCcw size={13} />}
            {ticket.status === "open" ? "Mark resolved" : "Reopen"}
          </button>
        </div>
        <div className="mt-2.5 flex items-center gap-1.5">
          <StatusBadge status={ticket.status} />
          <PriorityBadge priority={ticket.priority} />
          <CategoryBadge category={ticket.category} />
        </div>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        {isLoading && <p className="text-[12.5px] text-ink-faint">Loading…</p>}
        <div className="flex flex-col gap-3">
          {messages.map((m) => (
            <div key={m.id} className={cn("flex", m.is_super_admin ? "justify-end" : "justify-start")}>
              <div className={cn("max-w-[75%] rounded-xl px-3.5 py-2.5", m.is_super_admin ? "bg-primary text-white" : "bg-bg-soft text-ink")}>
                <div className={cn("mb-0.5 flex items-center gap-1.5 text-[10.5px]", m.is_super_admin ? "text-white/80" : "text-ink-faint")}>
                  {m.is_super_admin && <ShieldCheck size={10} />}
                  <span className="font-medium">{m.is_super_admin ? "Support team" : (m.author_name ?? "Unknown")}</span>
                  <span>· {new Date(m.created_at).toLocaleString()}</span>
                </div>
                <p className="whitespace-pre-wrap text-[13px]">{m.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-2 border-t border-line-soft px-5 py-3.5">
        <textarea
          className="flex-1 resize-none rounded-md border border-line-soft bg-surface px-3 py-2 text-[13px] outline-none focus:border-primary"
          rows={2} placeholder="Write a reply…" value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
        />
        <button
          type="button" disabled={!draft.trim() || reply.isPending} onClick={submit}
          className={cn("flex h-[38px] items-center gap-1.5 rounded-md bg-primary px-3.5 text-[12.5px] font-medium text-white", (!draft.trim() || reply.isPending) && "opacity-50")}
        >
          {reply.isPending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
          Send
        </button>
      </div>
    </div>
  );
}

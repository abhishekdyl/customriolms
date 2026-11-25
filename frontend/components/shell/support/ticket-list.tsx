"use client";
import type { SupportTicket } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CategoryBadge, PriorityBadge, StatusBadge } from "./ticket-badges";

/** The left-hand list in the master/detail layout. Shared by both
 * sides — the Org Admin's own list has showOrg=false (every row is
 * their own org, so an org column would be noise); the Super Admin's
 * cross-org queue passes showOrg=true so each row says which org it's
 * from. */
export function TicketList({
  tickets, selectedId, onSelect, showOrg = false,
}: {
  tickets: SupportTicket[]; selectedId: string | null; onSelect: (id: string) => void; showOrg?: boolean;
}) {
  if (tickets.length === 0) {
    return <p className="px-4 py-8 text-center text-[12.5px] text-ink-faint">No tickets here.</p>;
  }
  return (
    <div className="flex flex-col divide-y divide-line-soft">
      {tickets.map((t) => (
        <button
          key={t.id} type="button" onClick={() => onSelect(t.id)}
          className={cn("flex flex-col gap-1.5 px-4 py-3 text-left transition", selectedId === t.id ? "bg-primary-soft" : "hover:bg-bg-soft")}
        >
          <div className="flex items-start justify-between gap-2">
            <span className="line-clamp-1 text-[12.5px] font-semibold text-ink">{t.subject}</span>
            <span className="shrink-0 text-[10px] text-ink-faint">{new Date(t.updated_at).toLocaleDateString()}</span>
          </div>
          {showOrg && <span className="text-[11px] font-medium text-ink-soft">{t.org_name}</span>}
          <div className="flex flex-wrap items-center gap-1">
            <StatusBadge status={t.status} />
            <PriorityBadge priority={t.priority} />
            <CategoryBadge category={t.category} />
          </div>
          <span className="text-[10.5px] text-ink-faint">{t.message_count} message{t.message_count === 1 ? "" : "s"} · {t.raised_by_name ?? "Unknown"}</span>
        </button>
      ))}
    </div>
  );
}

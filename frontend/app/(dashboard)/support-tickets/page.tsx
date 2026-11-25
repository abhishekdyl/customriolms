"use client";
import { useEffect, useMemo, useState } from "react";
import { LifeBuoy } from "lucide-react";
import { useSupportTickets, type SupportTicketFilters } from "@/lib/hooks/use-support-tickets";
import { useOrgs } from "@/lib/hooks/use-orgs";
import { TicketList } from "@/components/shell/support/ticket-list";
import { TicketThread } from "@/components/shell/support/ticket-thread";
import { supportCategoryLabel, supportPriorityLabel, type SupportTicketCategory, type SupportTicketPriority, type SupportTicketStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusFilters: { id: "all" | SupportTicketStatus; label: string }[] = [
  { id: "all", label: "All" }, { id: "open", label: "Open" }, { id: "resolved", label: "Resolved" },
];

export default function SupportTicketsPage() {
  const { data: orgs = [] } = useOrgs();
  const [status, setStatus] = useState<"all" | SupportTicketStatus>("all");
  const [category, setCategory] = useState<"all" | SupportTicketCategory>("all");
  const [priority, setPriority] = useState<"all" | SupportTicketPriority>("all");
  const [orgId, setOrgId] = useState<string>("all");

  const filters: SupportTicketFilters = useMemo(() => ({
    status: status === "all" ? undefined : status,
    category: category === "all" ? undefined : category,
    priority: priority === "all" ? undefined : priority,
    org_id: orgId === "all" ? undefined : orgId,
  }), [status, category, priority, orgId]);

  const { data: tickets = [], isLoading } = useSupportTickets(filters);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && tickets.length > 0) setSelectedId(tickets[0].id);
    if (selectedId && !tickets.some((t) => t.id === selectedId)) setSelectedId(tickets[0]?.id ?? null);
  }, [tickets, selectedId]);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;
  const openCount = tickets.filter((t) => t.status === "open").length;

  return (
    <div className="flex h-screen min-w-0 flex-col">
      <div className="flex items-center justify-between border-b border-line-soft px-8 py-5">
        <div>
          <h1 className="font-head text-xl text-ink">Support tickets</h1>
          <p className="mt-0.5 text-sm text-ink-faint">Every org&apos;s support conversation with the platform team, in one queue.</p>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-amber-soft px-3 py-1.5 text-[12px] font-semibold text-amber">
          <LifeBuoy size={13} /> {openCount} open
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div className="flex w-[360px] shrink-0 flex-col border-r border-line-soft">
          <div className="flex flex-col gap-2 border-b border-line-soft px-4 py-3">
            <div className="flex gap-1 rounded-lg bg-line-soft p-1">
              {statusFilters.map((f) => (
                <button
                  key={f.id} type="button" onClick={() => setStatus(f.id)}
                  className={cn("flex-1 rounded-md py-1.5 text-[11.5px] font-medium", status === f.id ? "bg-surface text-ink shadow-sm" : "text-ink-faint")}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <select value={category} onChange={(e) => setCategory(e.target.value as typeof category)} className="rounded-md border border-line-soft bg-surface px-1.5 py-1 text-[11px]">
                <option value="all">Category</option>
                {Object.entries(supportCategoryLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)} className="rounded-md border border-line-soft bg-surface px-1.5 py-1 text-[11px]">
                <option value="all">Priority</option>
                {Object.entries(supportPriorityLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
              <select value={orgId} onChange={(e) => setOrgId(e.target.value)} className="rounded-md border border-line-soft bg-surface px-1.5 py-1 text-[11px]">
                <option value="all">Org</option>
                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-ink-faint">Loading…</p>
            ) : (
              <TicketList tickets={tickets} selectedId={selectedId} onSelect={setSelectedId} showOrg />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {selected ? (
            <TicketThread ticket={selected} showOrg />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <LifeBuoy size={28} className="text-ink-faint" />
              <p className="text-[13px] text-ink-faint">No tickets match these filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

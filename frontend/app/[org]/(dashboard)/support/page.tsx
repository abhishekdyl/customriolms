"use client";
import { useEffect, useState } from "react";
import { LifeBuoy, Plus } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { useSupportTickets } from "@/lib/hooks/use-support-tickets";
import { TicketList } from "@/components/shell/support/ticket-list";
import { TicketThread } from "@/components/shell/support/ticket-thread";
import { NewTicketModal } from "@/components/shell/support/new-ticket-modal";

export default function SupportPage() {
  const { data: tickets = [], isLoading } = useSupportTickets();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    if (!selectedId && tickets.length > 0) setSelectedId(tickets[0].id);
  }, [tickets, selectedId]);

  const selected = tickets.find((t) => t.id === selectedId) ?? null;

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col">
      <Topbar title="Support" />
      <div className="flex min-h-0 flex-1">
        <div className="flex w-[320px] shrink-0 flex-col border-r border-line-soft">
          <div className="flex items-center justify-between gap-2 px-4 py-3.5">
            <div className="flex items-center gap-1.5 text-[13px] font-semibold text-ink">
              <LifeBuoy size={14} className="text-primary" />
              Your tickets
            </div>
            <button
              type="button" onClick={() => setShowNew(true)}
              className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11.5px] font-medium text-white"
            >
              <Plus size={12} /> New
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {isLoading ? (
              <p className="px-4 py-8 text-center text-[12.5px] text-ink-faint">Loading…</p>
            ) : (
              <TicketList tickets={tickets} selectedId={selectedId} onSelect={setSelectedId} />
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {selected ? (
            <TicketThread ticket={selected} />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
              <LifeBuoy size={28} className="text-ink-faint" />
              <p className="text-[13px] text-ink-faint">
                {tickets.length === 0 ? "No support tickets yet — raise one if you need help from the platform team." : "Select a ticket to view the conversation."}
              </p>
            </div>
          )}
        </div>
      </div>

      {showNew && (
        <NewTicketModal onClose={() => setShowNew(false)} onCreated={(id) => { setSelectedId(id); setShowNew(false); }} />
      )}
    </div>
  );
}

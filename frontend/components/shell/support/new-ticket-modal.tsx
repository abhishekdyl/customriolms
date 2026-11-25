"use client";
import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { useCreateSupportTicket } from "@/lib/hooks/use-support-tickets";
import { supportCategoryLabel, supportPriorityLabel, type SupportTicketCategory, type SupportTicketPriority } from "@/lib/types";
import { cn } from "@/lib/utils";

export function NewTicketModal({ onClose, onCreated }: { onClose: () => void; onCreated: (ticketId: string) => void }) {
  const create = useCreateSupportTicket();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<SupportTicketCategory>("query");
  const [priority, setPriority] = useState<SupportTicketPriority>("medium");

  const submit = () => {
    if (!subject.trim() || !body.trim()) return;
    create.mutate(
      { subject: subject.trim(), body: body.trim(), category, priority },
      { onSuccess: (ticket) => onCreated(ticket.id) }
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-xl bg-surface p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[15px] font-semibold text-ink">New support ticket</h3>
          <button type="button" onClick={onClose} className="text-ink-faint hover:text-ink">
            <X size={16} />
          </button>
        </div>

        <div className="flex flex-col gap-3.5">
          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-ink-soft">Subject</label>
            <input
              className="w-full rounded-md border border-line-soft bg-bg px-3 py-2 text-[13px] outline-none focus:border-primary"
              value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Brief summary of the issue"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-ink-soft">Category</label>
              <select
                className="w-full rounded-md border border-line-soft bg-bg px-3 py-2 text-[13px] outline-none focus:border-primary"
                value={category} onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
              >
                {Object.entries(supportCategoryLabel).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[11.5px] font-medium text-ink-soft">Priority</label>
              <select
                className="w-full rounded-md border border-line-soft bg-bg px-3 py-2 text-[13px] outline-none focus:border-primary"
                value={priority} onChange={(e) => setPriority(e.target.value as SupportTicketPriority)}
              >
                {Object.entries(supportPriorityLabel).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11.5px] font-medium text-ink-soft">Describe the issue</label>
            <textarea
              className="w-full resize-none rounded-md border border-line-soft bg-bg px-3 py-2 text-[13px] outline-none focus:border-primary"
              rows={5} value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="What's happening, and what did you expect instead?"
            />
          </div>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-md border border-line-soft px-3.5 py-2 text-[12.5px] font-medium text-ink-soft">
            Cancel
          </button>
          <button
            type="button" disabled={!subject.trim() || !body.trim() || create.isPending} onClick={submit}
            className={cn("flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-[12.5px] font-medium text-white", (!subject.trim() || !body.trim() || create.isPending) && "opacity-50")}
          >
            {create.isPending && <Loader2 size={13} className="animate-spin" />}
            Submit ticket
          </button>
        </div>
      </div>
    </div>
  );
}

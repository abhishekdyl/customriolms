"use client";
import { AlertCircle, CheckCircle2, MinusCircle } from "lucide-react";
import { useWhatsAppLog } from "@/lib/hooks/use-notifications";
import { whatsappKindLabel } from "@/lib/notifications";

function StatusBadge({ status }: { status: "sent" | "failed" | "skipped" }) {
  if (status === "sent") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-success-soft px-2.5 py-0.5 text-[10.5px] font-semibold text-success">
        <CheckCircle2 size={11} /> Sent
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="flex items-center gap-1 rounded-full bg-danger-soft px-2.5 py-0.5 text-[10.5px] font-semibold text-danger">
        <AlertCircle size={11} /> Failed
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1 rounded-full bg-paper px-2.5 py-0.5 text-[10.5px] font-semibold text-ink-faint">
      <MinusCircle size={11} /> Not sent
    </span>
  );
}

/** "Kis ko kab kaunsa WhatsApp gaya" — every certificate notification,
 * Course Launch / Webinar broadcast, and test send this org has
 * triggered, newest first. */
export function WhatsAppLogTab() {
  const { data: rows, isLoading } = useWhatsAppLog();

  return (
    <div className="max-w-[720px]">
      <p className="mb-4 text-[11.5px] text-ink-faint">
        Every WhatsApp message this org has tried to send — who it went to, what it was, and whether it actually sent.
      </p>
      <div className="overflow-hidden rounded-[10px] border border-line">
        <table className="w-full text-left text-[12.5px]">
          <thead>
            <tr className="bg-line-soft text-[11px] text-ink-faint">
              <th className="px-3 py-2 font-medium">To</th>
              <th className="px-3 py-2 font-medium">Kind</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">When</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-ink-faint">Loading…</td></tr>
            )}
            {!isLoading && !rows?.length && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-ink-faint">No WhatsApp messages sent yet.</td></tr>
            )}
            {rows?.map((r) => (
              <tr key={r.id} className="border-t border-line-soft">
                <td className="px-3 py-2.5 text-ink">{r.to_phone}</td>
                <td className="px-3 py-2.5 text-ink-faint">{whatsappKindLabel[r.kind]}</td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={r.status} />
                  {r.status !== "sent" && r.detail && <div className="mt-0.5 text-[10.5px] text-ink-faint" title={r.detail}>{r.detail}</div>}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-ink-faint">{new Date(r.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

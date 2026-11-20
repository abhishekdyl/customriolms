"use client";
import { useState } from "react";
import { Download, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMyOrgPayments, downloadMyOrgPaymentInvoice } from "@/lib/hooks/use-billing";
import { planLabel, paymentStatusLabel, paymentStatusStyle, formatRupees, formatDate } from "@/lib/org-display";

/**
 * Org Admin's own Billing page — their org's subscription payment
 * history, newest first, with a downloadable PDF invoice for anything
 * Razorpay has actually confirmed. Exact mirror of the Super Admin's
 * org-detail drawer Billing tab (components/shell/org-detail-drawer.tsx),
 * just scoped to "my own org" via GET /billing/payments instead of
 * taking an org_id. Course-payment collections (money from learners)
 * are a separate concern, not shown here.
 */
export default function BillingPage() {
  const { data: payments, isLoading, isError } = useMyOrgPayments();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const download = async (id: string) => {
    setDownloadError(null);
    setDownloadingId(id);
    try {
      await downloadMyOrgPaymentInvoice(id);
    } catch {
      setDownloadError("Couldn't download that invoice. Try again in a moment.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="max-w-[720px] overflow-auto p-5 md:p-8">
      <div className="mb-1 flex items-center gap-2">
        <CreditCard size={18} className="text-ink-faint" />
        <h1 className="font-head text-xl text-ink">Billing</h1>
      </div>
      <p className="mb-6 text-[13px] text-ink-faint">
        Your organization&apos;s subscription payments to Riosmart — every checkout attempt, newest first. A GST
        invoice is emailed automatically as soon as a payment is confirmed, and you can re-download any of them
        here any time.
      </p>

      {isLoading && <p className="text-sm text-ink-faint">Loading…</p>}
      {isError && <p className="text-sm text-danger">Couldn&apos;t load your billing history.</p>}
      {downloadError && <p className="mb-3 text-sm text-danger">{downloadError}</p>}

      {payments && payments.length === 0 && (
        <p className="rounded-[10px] border border-line bg-surface p-5 text-sm text-ink-faint">
          No invoices yet — your organization is either still on its free trial, or its plan was activated manually
          by Riosmart, with no Razorpay charge.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {payments?.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-4 rounded-[10px] border border-line bg-surface p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-medium text-ink">{planLabel[p.plan]} plan — {formatRupees(p.amount)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentStatusStyle[p.status]}`}>
                  {paymentStatusLabel[p.status]}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-ink-faint">
                Order {p.razorpay_order_id} · Created {formatDate(p.created_at)}
                {p.paid_at ? ` · Paid ${formatDate(p.paid_at)}` : ""}
              </div>
            </div>
            {p.status === "paid" && (
              <Button variant="secondary" size="sm" disabled={downloadingId === p.id} onClick={() => download(p.id)}>
                <Download size={13} className="mr-1.5" />
                {downloadingId === p.id ? "Downloading…" : "Invoice"}
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { Download, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LearnerPage } from "@/components/learner/shell";
import { useMyCourseEnrolPayments, downloadMyCourseEnrolPaymentInvoice } from "@/lib/hooks/use-enrolment";
import { paymentStatusLabel, paymentStatusStyle, formatRupees, formatDate } from "@/lib/org-display";

/**
 * A learner's own "Payments" page — every paid-enrolment checkout
 * they've made, across any course, newest first, with a downloadable
 * PDF invoice for anything Razorpay has actually confirmed. Separate
 * from the Org Admin's Billing page (app/[org]/(dashboard)/billing) —
 * that one is the org's own subscription history with Riosmart, this
 * one is a learner's own course purchases.
 */
export default function LearnerPaymentsPage() {
  const { data: payments, isLoading, isError } = useMyCourseEnrolPayments();
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const download = async (id: string) => {
    setDownloadError(null);
    setDownloadingId(id);
    try {
      await downloadMyCourseEnrolPaymentInvoice(id);
    } catch {
      setDownloadError("Couldn't download that invoice. Try again in a moment.");
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <LearnerPage title="Payments">
      <p className="mb-5 text-[12.5px] text-ink-faint">Every course you've paid to enrol in, with a downloadable invoice.</p>

      {isLoading && <p className="text-sm text-ink-faint">Loading…</p>}
      {isError && <p className="text-sm text-danger">Couldn&apos;t load your payments.</p>}
      {downloadError && <p className="mb-3 text-sm text-danger">{downloadError}</p>}

      {payments && payments.length === 0 && (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-line bg-surface p-8 text-center">
          <Receipt size={22} className="text-ink-faint" />
          <p className="text-sm text-ink-faint">You haven&apos;t paid for any course enrolment yet.</p>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {payments?.map((p) => (
          <div key={p.id} className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[13.5px] font-medium text-ink">{p.course_title}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentStatusStyle[p.status]}`}>
                  {paymentStatusLabel[p.status]}
                </span>
              </div>
              <div className="mt-1 text-[11.5px] text-ink-faint">
                {formatRupees(p.amount)} · {formatDate(p.created_at)}
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
    </LearnerPage>
  );
}

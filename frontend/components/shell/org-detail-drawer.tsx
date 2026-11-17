"use client";
import { useState } from "react";
import { Building2, CalendarClock } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerBody } from "@/components/ui/drawer";
import { useOrgPayments } from "@/lib/hooks/use-orgs";
import { planLabel, planStyle, statusStyle, paymentStatusLabel, paymentStatusStyle, formatRupees, formatDate, daysLeft } from "@/lib/org-display";
import type { Org } from "@/lib/types";

type Tab = "overview" | "billing";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="text-ink-faint">{label}</dt>
      <dd className="text-right font-medium text-ink">{value}</dd>
    </div>
  );
}

/** Single-org detail view shared by the Organizations and Subscriptions
 * pages — click a row on either, this slides in with everything about
 * that one org: Overview (plan, trial/validity, seats, admin) and
 * Billing & Payments (its OrgPayment history). Render with `key={org?.id}`
 * at the call site so opening a different org resets the open tab
 * instead of carrying over whatever tab the previous org was showing. */
export function OrgDetailDrawer({ org, defaultTab = "overview", onClose }: { org: Org | null; defaultTab?: Tab; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>(defaultTab);
  const payments = useOrgPayments(org?.id ?? null);

  if (!org) return null;

  const trialing = org.status === "trial" && !!org.trial_ends_at;
  const trialDaysLeft = trialing ? daysLeft(org.trial_ends_at!) : null;

  return (
    <Drawer open={!!org} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent>
        <DrawerHeader>
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <DrawerTitle>{org.name}</DrawerTitle>
              <p className="text-[11px] text-ink-faint">{org.slug}</p>
            </div>
          </div>
        </DrawerHeader>

        <div className="flex border-b border-line-soft px-6">
          {(["overview", "billing"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-xs font-medium ${
                tab === t ? "border-primary text-ink" : "border-transparent text-ink-faint hover:text-ink-soft"
              }`}
            >
              {t === "overview" ? "Overview" : "Billing & Payments"}
            </button>
          ))}
        </div>

        <DrawerBody className="p-6">
          {tab === "overview" && (
            <div className="flex flex-col gap-4">
              <div className="flex gap-2">
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium capitalize ${statusStyle[org.status]}`}>{org.status}</span>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${planStyle[org.plan]}`}>{planLabel[org.plan]} plan</span>
              </div>

              {trialing && (
                <div className="rounded-lg border border-line bg-paper-raised p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-medium text-ink">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {trialDaysLeft! > 0 ? `Free trial — ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left` : "Free trial has ended"}
                  </div>
                  <div className="mt-1 text-ink-faint">Till date (plan expires): {formatDate(org.trial_ends_at!)}</div>
                </div>
              )}
              {org.status === "suspended" && org.suspension_reason === "trial_expired" && (
                <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
                  Trial ended {org.trial_ends_at ? formatDate(org.trial_ends_at) : ""} — awaiting payment or manual
                  activation from the Subscriptions page.
                </div>
              )}
              {org.status === "suspended" && org.suspension_reason === "manual" && (
                <div className="rounded-lg border border-danger/30 bg-danger-soft p-3 text-xs text-danger">
                  Manually suspended by a Super Admin.
                </div>
              )}

              <dl className="flex flex-col gap-3 text-xs">
                <Row label="Org Admin" value={org.admin_name ? `${org.admin_name} (${org.admin_email})` : "No Org Admin yet"} />
                <Row label="Seats" value={`${org.user_count} / ${org.user_limit} used`} />
                <Row label="Industry" value={org.industry ?? "—"} />
                <Row label="Timezone" value={org.timezone} />
                <Row label="Contact email" value={org.contact_email ?? "—"} />
                <Row label="Created" value={formatDate(org.created_at)} />
                {org.trial_ends_at && (
                  <Row label="Self-serve trial" value={`Came through free trial — ran out ${formatDate(org.trial_ends_at)}`} />
                )}
              </dl>
            </div>
          )}

          {tab === "billing" && (
            <div className="flex flex-col gap-3">
              {payments.isLoading && <p className="text-xs text-ink-faint">Loading billing history…</p>}
              {payments.isError && <p className="text-xs text-danger">Couldn&apos;t load billing history.</p>}
              {payments.data && payments.data.length === 0 && (
                <p className="text-xs text-ink-faint">
                  No invoices yet —{" "}
                  {org.status === "active"
                    ? "this org was activated manually by a Super Admin, with no Razorpay charge."
                    : "this org is still on its free trial."}
                </p>
              )}
              {payments.data?.map((p) => (
                <div key={p.id} className="rounded-lg border border-line p-3 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-ink">
                      {planLabel[p.plan]} — {formatRupees(p.amount)}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${paymentStatusStyle[p.status]}`}>
                      {paymentStatusLabel[p.status]}
                    </span>
                  </div>
                  <div className="mt-1.5 flex flex-col gap-0.5 text-ink-faint">
                    <span>Order {p.razorpay_order_id}</span>
                    <span>
                      Created {formatDate(p.created_at)}
                      {p.paid_at ? ` · Paid ${formatDate(p.paid_at)}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
}

"use client";
import { useMemo, useState } from "react";
import { CreditCard, Users as UsersIcon, Search, Copy, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OrgDetailDrawer } from "@/components/shell/org-detail-drawer";
import { usePilots, useActivateLicense } from "@/lib/hooks/use-orgs";
import { ApiError } from "@/lib/api-client";
import { planLabel, formatDate, daysLeft } from "@/lib/org-display";
import type { Org, OrgPlan } from "@/lib/types";

type SubscriptionBadge = { label: string; className: string };

/** Everything this list shows per row is derived here, client-side, from
 * status + trial_ends_at + suspension_reason — see OrgOut's docstring on
 * why the backend doesn't precompute "N days left". */
function subscriptionBadge(org: Org): SubscriptionBadge {
  if (org.status === "active") return { label: "Licensed", className: "bg-success-soft text-success" };
  if (org.status === "suspended" && org.suspension_reason === "trial_expired") {
    return { label: "Trial expired", className: "bg-danger-soft text-danger" };
  }
  if (org.status === "suspended") return { label: "Suspended", className: "bg-danger-soft text-danger" };
  if (org.trial_ends_at) {
    const left = daysLeft(org.trial_ends_at);
    if (left <= 0) return { label: "Trial expired", className: "bg-danger-soft text-danger" };
    if (left <= 3) return { label: `${left} day${left === 1 ? "" : "s"} left`, className: "bg-amber-soft text-amber" };
    return { label: `${left} days left`, className: "bg-primary-soft text-primary" };
  }
  return { label: "On trial", className: "bg-amber-soft text-amber" };
}

function ActivateDialog({ org, onClose }: { org: Org; onClose: () => void }) {
  const activate = useActivateLicense();
  const [plan, setPlan] = useState<OrgPlan>(org.plan === "free" ? "starter" : org.plan);
  const [userLimit, setUserLimit] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    activate.mutate(
      { id: org.id, plan, user_limit: userLimit ? Number(userLimit) : undefined },
      { onSuccess: onClose }
    );
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Activate {org.name}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5 p-6">
          <p className="text-xs text-ink-faint">
            Moves this org straight to ACTIVE without a Razorpay payment — for an offline deal, a goodwill extension,
            or testing. No payment record is created.
          </p>
          {activate.isError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {activate.error instanceof ApiError ? activate.error.message : "Something went wrong."}
            </p>
          )}
          <div>
            <Label className="mb-1.5 block">Plan</Label>
            <select
              value={plan}
              onChange={(e) => setPlan(e.target.value as OrgPlan)}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus-visible:border-primary"
            >
              <option value="starter">Starter (up to 20 users)</option>
              <option value="growth">Growth (up to 100 users)</option>
              <option value="enterprise">Enterprise (up to 500 users)</option>
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block">Seat limit override (optional)</Label>
            <Input
              type="number" min={1} placeholder="Leave blank to use the plan default"
              value={userLimit} onChange={(e) => setUserLimit(e.target.value)}
            />
          </div>
          <Button type="submit" className="mt-2" disabled={activate.isPending}>
            {activate.isPending ? "Activating…" : "Activate"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex-1 rounded-xl border border-line bg-surface p-4">
      <div className="text-xs text-ink-faint">{label}</div>
      <div className="mt-1 font-head text-2xl text-ink">{value}</div>
    </div>
  );
}

export default function SubscriptionsPage() {
  const { data: orgs, isLoading, isError } = usePilots();
  const [search, setSearch] = useState("");
  const [activating, setActivating] = useState<Org | null>(null);
  const [viewingOrg, setViewingOrg] = useState<Org | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const counts = useMemo(() => {
    const now = Date.now();
    let trialing = 0, expired = 0, licensed = 0;
    for (const o of orgs ?? []) {
      if (o.status === "active") licensed++;
      else if (o.status === "suspended" && o.suspension_reason === "trial_expired") expired++;
      else if (o.trial_ends_at && new Date(o.trial_ends_at).getTime() < now) expired++;
      else trialing++;
    }
    return { total: orgs?.length ?? 0, trialing, expired, licensed };
  }, [orgs]);

  const shown = useMemo(() => {
    let list = orgs ?? [];
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q) || (o.admin_email ?? "").toLowerCase().includes(q));
    }
    return list;
  }, [orgs, search]);

  const copyEmail = (email: string) => {
    navigator.clipboard?.writeText(email);
    setCopied(email);
    setTimeout(() => setCopied(null), 1500);
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-head text-xl text-ink">Subscriptions</h1>
          <p className="mt-0.5 text-sm text-ink-faint">
            Every org that signed up on its own through the free trial — its plan, till date (when the trial/plan
            expires), and its full billing history: invoices, payments, renewals, dues.
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
          <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-52 pl-8 text-xs" />
        </div>
      </div>

      <div className="mb-6 flex gap-3">
        <StatCard label="Total" value={counts.total} />
        <StatCard label="Still trialing (Free)" value={counts.trialing} />
        <StatCard label="Trial expired" value={counts.expired} />
        <StatCard label="Licensed" value={counts.licensed} />
      </div>

      {isLoading && <p className="text-sm text-ink-faint">Loading subscriptions…</p>}
      {isError && <p className="text-sm text-danger">Couldn&apos;t load subscriptions — is the backend running?</p>}
      {!isLoading && !isError && shown.length === 0 && (
        <p className="text-sm text-ink-faint">
          {orgs && orgs.length > 0 ? "No orgs match your search." : "No one has self-registered a trial org yet."}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {shown.map((org) => {
          const badge = subscriptionBadge(org);
          return (
            <div
              key={org.id}
              onClick={() => setViewingOrg(org)}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-line bg-surface p-4 hover:border-line-strong"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-soft">
                <CreditCard className="h-4 w-4 text-amber" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-ink">{org.name}</span>
                  <span className="text-[11px] text-ink-faint">({org.slug})</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.className}`}>{badge.label}</span>
                  <span className="rounded-full bg-line-soft px-2 py-0.5 text-[11px] font-medium text-ink-soft">{planLabel[org.plan]}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-3 text-xs text-ink-faint">
                  {org.admin_email && (
                    <button
                      onClick={(e) => { e.stopPropagation(); copyEmail(org.admin_email!); }}
                      className="flex items-center gap-1 hover:text-ink-soft"
                    >
                      {org.admin_name} · {org.admin_email}
                      <Copy className="h-3 w-3" />
                      {copied === org.admin_email && <span className="text-success">Copied</span>}
                    </button>
                  )}
                  <span className="flex items-center gap-1"><UsersIcon className="h-3 w-3" /> {org.user_count}/{org.user_limit} seats</span>
                  <span>signed up {formatDate(org.created_at)}</span>
                  {org.trial_ends_at && (
                    <span className="font-medium text-ink-soft">Till date: {formatDate(org.trial_ends_at)}</span>
                  )}
                </div>
              </div>
              <Button
                size="icon" variant="ghost" title="Billing & payments"
                onClick={(e) => { e.stopPropagation(); setViewingOrg(org); }}
              >
                <Receipt className="h-3.5 w-3.5 text-ink-soft" />
              </Button>
              {org.status !== "active" && (
                <Button variant="secondary" onClick={(e) => { e.stopPropagation(); setActivating(org); }}>
                  Activate manually
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {activating && <ActivateDialog org={activating} onClose={() => setActivating(null)} />}
      <OrgDetailDrawer key={viewingOrg?.id ?? "none"} org={viewingOrg} defaultTab="billing" onClose={() => setViewingOrg(null)} />
    </div>
  );
}

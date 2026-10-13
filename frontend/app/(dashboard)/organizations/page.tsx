"use client";
import { useMemo, useState } from "react";
import { Plus, Building2, Users as UsersIcon, Search, Bell, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOrgs, useCreateOrg, useUpdateOrg, useUpdateOrgStatus } from "@/lib/hooks/use-orgs";
import { ApiError } from "@/lib/api-client";
import type { Org, OrgPlan, OrgStatus } from "@/lib/types";

const planLabel: Record<OrgPlan, string> = { starter: "Starter", growth: "Growth", enterprise: "Enterprise" };
const statusStyle: Record<OrgStatus, string> = {
  active: "bg-success-soft text-success",
  trial: "bg-amber-soft text-amber",
  suspended: "bg-danger-soft text-danger",
};
const statusFilters: { id: "all" | OrgStatus; label: string }[] = [
  { id: "all", label: "All" },
  { id: "active", label: "Active" },
  { id: "trial", label: "Trial" },
  { id: "suspended", label: "Suspended" },
];

function CreateOrgDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const createOrg = useCreateOrg();
  const [form, setForm] = useState({ org_name: "", plan: "starter" as OrgPlan, admin_name: "", admin_email: "", admin_password: "" });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    createOrg.mutate(form, {
      onSuccess: () => {
        onOpenChange(false);
        setForm({ org_name: "", plan: "starter", admin_name: "", admin_email: "", admin_password: "" });
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New organization</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5 p-6">
          {createOrg.isError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {createOrg.error instanceof ApiError ? createOrg.error.message : "Something went wrong."}
            </p>
          )}
          <div>
            <Label className="mb-1.5 block">Organization name</Label>
            <Input value={form.org_name} onChange={(e) => setForm({ ...form, org_name: e.target.value })} placeholder="Acme Manufacturing" required />
          </div>
          <div>
            <Label className="mb-1.5 block">Plan</Label>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value as OrgPlan })}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus-visible:border-primary"
            >
              <option value="starter">Starter (up to 20 users)</option>
              <option value="growth">Growth (up to 100 users)</option>
              <option value="enterprise">Enterprise (up to 500 users)</option>
            </select>
          </div>
          <div className="mt-2 border-t border-line-soft pt-3.5">
            <p className="mb-2.5 text-xs font-medium text-ink-faint">First Org Admin for this org</p>
          </div>
          <div>
            <Label className="mb-1.5 block">Admin name</Label>
            <Input value={form.admin_name} onChange={(e) => setForm({ ...form, admin_name: e.target.value })} required />
          </div>
          <div>
            <Label className="mb-1.5 block">Admin email</Label>
            <Input type="email" value={form.admin_email} onChange={(e) => setForm({ ...form, admin_email: e.target.value })} required />
          </div>
          <div>
            <Label className="mb-1.5 block">Temporary password</Label>
            <Input type="password" minLength={8} value={form.admin_password} onChange={(e) => setForm({ ...form, admin_password: e.target.value })} required />
          </div>
          <Button type="submit" className="mt-2" disabled={createOrg.isPending}>
            {createOrg.isPending ? "Creating…" : "Create organization"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditOrgDialog({ org, onOpenChange }: { org: Org | null; onOpenChange: (v: boolean) => void }) {
  const updateOrg = useUpdateOrg();
  const [form, setForm] = useState({ name: org?.name ?? "", plan: (org?.plan ?? "starter") as OrgPlan, user_limit: org?.user_limit ?? 20 });

  // Reset the form whenever a different org is opened for editing.
  useMemo(() => {
    if (org) setForm({ name: org.name, plan: org.plan, user_limit: org.user_limit });
  }, [org]);

  if (!org) return null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    updateOrg.mutate(
      { id: org.id, name: form.name, plan: form.plan, user_limit: form.user_limit },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={!!org} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit organization</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5 p-6">
          {updateOrg.isError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {updateOrg.error instanceof ApiError ? updateOrg.error.message : "Something went wrong."}
            </p>
          )}
          <div>
            <Label className="mb-1.5 block">Organization name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </div>
          <div>
            <Label className="mb-1.5 block">Plan</Label>
            <select
              value={form.plan}
              onChange={(e) => setForm({ ...form, plan: e.target.value as OrgPlan })}
              className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus-visible:border-primary"
            >
              <option value="starter">Starter</option>
              <option value="growth">Growth</option>
              <option value="enterprise">Enterprise</option>
            </select>
          </div>
          <div>
            <Label className="mb-1.5 block">Seat limit</Label>
            <Input
              type="number"
              min={1}
              value={form.user_limit}
              onChange={(e) => setForm({ ...form, user_limit: Number(e.target.value) })}
              required
            />
            <p className="mt-1 text-[11px] text-ink-faint">Changing plan resets this to that plan&apos;s default unless you edit it here too.</p>
          </div>
          <Button type="submit" className="mt-2" disabled={updateOrg.isPending}>
            {updateOrg.isPending ? "Saving…" : "Save changes"}
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

export default function OrganizationsPage() {
  const { data: orgs, isLoading, isError } = useOrgs();
  const updateStatus = useUpdateOrgStatus();
  const [createOpen, setCreateOpen] = useState(false);
  const [editingOrg, setEditingOrg] = useState<Org | null>(null);
  const [filter, setFilter] = useState<"all" | OrgStatus>("all");
  const [search, setSearch] = useState("");

  const counts = useMemo(
    () => ({
      total: orgs?.length ?? 0,
      active: orgs?.filter((o) => o.status === "active").length ?? 0,
      trial: orgs?.filter((o) => o.status === "trial").length ?? 0,
      suspended: orgs?.filter((o) => o.status === "suspended").length ?? 0,
    }),
    [orgs]
  );

  const shown = useMemo(() => {
    let list = orgs ?? [];
    if (filter !== "all") list = list.filter((o) => o.status === filter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((o) => o.name.toLowerCase().includes(q) || o.slug.toLowerCase().includes(q));
    }
    return list;
  }, [orgs, filter, search]);

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-head text-xl text-ink">Organizations</h1>
          <p className="mt-0.5 text-sm text-ink-faint">Every customer org on the platform — create, edit, suspend, or remove.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-ink-faint" />
            <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9 w-52 pl-8 text-xs" />
          </div>
          <Bell className="h-4.5 w-4.5 text-ink-soft" />
        </div>
      </div>

      <div className="mb-6 flex gap-3">
        <StatCard label="Total organizations" value={counts.total} />
        <StatCard label="Active" value={counts.active} />
        <StatCard label="On trial" value={counts.trial} />
        <StatCard label="Suspended" value={counts.suspended} />
      </div>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-1.5">
          {statusFilters.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                filter === f.id ? "bg-ink text-white" : "border border-line text-ink-soft hover:bg-line-soft"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4" /> New organization
        </Button>
      </div>

      {isLoading && <p className="text-sm text-ink-faint">Loading organizations…</p>}
      {isError && <p className="text-sm text-danger">Couldn&apos;t load organizations — is the backend running?</p>}

      <div className="flex flex-col gap-2">
        {shown.map((org) => (
          <div key={org.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft">
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{org.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${statusStyle[org.status]}`}>{org.status}</span>
              </div>
              <div className="mt-0.5 flex items-center gap-3 text-xs text-ink-faint">
                <span>{org.slug}</span>
                <span>{planLabel[org.plan]}</span>
                <span className="flex items-center gap-1"><UsersIcon className="h-3 w-3" /> {org.user_count}/{org.user_limit} seats</span>
                <span>since {new Date(org.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</span>
              </div>
            </div>

            <select
              value={org.status}
              onChange={(e) => {
                const next = e.target.value as OrgStatus;
                if (next === "suspended" && !confirm(`Suspend "${org.name}"? Every active session in this org is ended immediately; no data is deleted.`)) return;
                updateStatus.mutate({ id: org.id, status: next });
              }}
              className="h-9 rounded-lg border border-line bg-surface px-2.5 text-xs capitalize outline-none focus-visible:border-primary"
            >
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="suspended">Suspended</option>
            </select>

            <Button size="icon" variant="ghost" title="Edit" onClick={() => setEditingOrg(org)}>
              <Pencil className="h-3.5 w-3.5 text-ink-soft" />
            </Button>
          </div>
        ))}
        {shown.length === 0 && !isLoading && <p className="text-sm text-ink-faint">No organizations match this view.</p>}
      </div>

      <CreateOrgDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditOrgDialog org={editingOrg} onOpenChange={(v) => !v && setEditingOrg(null)} />
    </div>
  );
}

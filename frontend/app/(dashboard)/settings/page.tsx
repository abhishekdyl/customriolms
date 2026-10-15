"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, ShieldCheck, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useMyOrg, useUpdateMyOrg, useDeactivateMyOrg } from "@/lib/hooks/use-orgs";
import { ApiError } from "@/lib/api-client";

const industryOptions = ["Manufacturing", "Automotive", "Logistics", "Retail", "Healthcare", "Technology", "Other"];
const timezoneOptions = ["Asia/Kolkata", "America/New_York", "America/Sao_Paulo", "Europe/London", "UTC"];

const planLabel: Record<string, string> = { starter: "Starter", growth: "Growth", enterprise: "Enterprise" };

type Draft = { name: string; slug: string; industry: string; timezone: string; contact_email: string };

export default function OrgSettingsPage() {
  const { data: org, isLoading } = useMyOrg();
  const updateOrg = useUpdateMyOrg();
  const deactivate = useDeactivateMyOrg();
  const router = useRouter();

  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);

  // Seed the draft once the org loads — and again whenever a save
  // succeeds, so "dirty" goes back to false against the new saved values.
  useEffect(() => {
    if (org) {
      setDraft({
        name: org.name,
        slug: org.slug,
        industry: org.industry ?? industryOptions[0],
        timezone: org.timezone,
        contact_email: org.contact_email ?? "",
      });
    }
  }, [org]);

  if (isLoading || !org || !draft) {
    return <div className="p-8 text-sm text-ink-faint">Loading…</div>;
  }

  const dirty =
    draft.name !== org.name ||
    draft.slug !== org.slug ||
    draft.industry !== (org.industry ?? industryOptions[0]) ||
    draft.timezone !== org.timezone ||
    draft.contact_email !== (org.contact_email ?? "");

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    if (!dirty) return;
    // Backend's contact_email is EmailStr | None — "" is neither a valid
    // email nor null, and 422s. Send null when the field is empty.
    updateOrg.mutate(
      { ...draft, contact_email: draft.contact_email.trim() === "" ? null : draft.contact_email },
      {
        onSuccess: () => {
          setSaved(true);
          setTimeout(() => setSaved(false), 2000);
        },
      }
    );
  };

  const confirmedDeactivate = () => {
    deactivate.mutate(undefined, {
      onSuccess: () => {
        // Every session org-wide, including this one, just got revoked
        // server-side — the token in localStorage is already dead, so
        // there's nothing left to do here but send the admin to log back
        // in (which will now be blocked, same as any suspended org).
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        router.push("/login");
      },
    });
  };

  return (
    <div className="max-w-[640px] overflow-auto p-5 md:p-8">
      <h1 className="mb-6 font-head text-xl text-ink">Org Settings</h1>

      {/* Plan / seats banner */}
      <div className="mb-5 flex items-center justify-between rounded-[10px] border border-line bg-surface p-4">
        <div>
          <div className="text-[11.5px] text-ink-faint">Plan</div>
          <div className="font-head text-base capitalize text-ink">{planLabel[org.plan] ?? org.plan}</div>
        </div>
        <div className="h-8 w-px bg-line-soft" />
        <div>
          <div className="text-[11.5px] text-ink-faint">Seats used</div>
          <div className="font-head text-base text-ink">
            {org.user_count} <span className="font-body text-[12.5px] font-normal text-ink-faint">of {org.user_limit}</span>
          </div>
        </div>
        <div className="max-w-[180px] text-right text-[11.5px] text-ink-faint">
          Need more seats? Contact Riosmart to raise your limit.
        </div>
      </div>

      {/* Domain restriction notice */}
      {org.allowed_domains.length > 0 && (
        <div className="mb-5 flex items-center gap-2 rounded-lg bg-primary-soft px-4 py-3">
          <ShieldCheck className="h-3.5 w-3.5 flex-shrink-0 text-primary" />
          <span className="text-[12.5px] text-ink">
            Invites are restricted to {org.allowed_domains.map((d) => `@${d}`).join(", ")}. Contact Riosmart to change this.
          </span>
        </div>
      )}

      {/* Logo */}
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-[10px] border-2 border-dashed border-line">
          {org.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={org.logo_url} alt="" className="h-full w-full rounded-[10px] object-cover" />
          ) : (
            <Building2 className="h-5 w-5 text-ink-faint" />
          )}
        </div>
        <div>
          <button
            type="button"
            title="Not wired up yet — there's no file storage behind this button"
            className="text-[12.5px] font-medium text-primary/60"
          >
            Upload logo
          </button>
          <div className="text-[11px] text-ink-faint">PNG or SVG, shown on the learner login and reports</div>
        </div>
      </div>

      {/* Profile form */}
      <form onSubmit={save} className="mb-4 rounded-[10px] border border-line bg-surface p-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <Label className="mb-1 block text-[11.5px] text-ink-soft">Organization name</Label>
            <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div>
            <Label className="mb-1 block text-[11.5px] text-ink-soft">URL slug</Label>
            <Input
              value={draft.slug}
              onChange={(e) => setDraft({ ...draft, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })}
            />
          </div>
          <div>
            <Label className="mb-1 block text-[11.5px] text-ink-soft">Industry</Label>
            <select
              value={draft.industry}
              onChange={(e) => setDraft({ ...draft, industry: e.target.value })}
              className="h-10 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] outline-none focus-visible:border-primary"
            >
              {industryOptions.map((i) => (
                <option key={i}>{i}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-1 block text-[11.5px] text-ink-soft">Timezone</Label>
            <select
              value={draft.timezone}
              onChange={(e) => setDraft({ ...draft, timezone: e.target.value })}
              className="h-10 w-full rounded-md border border-line bg-surface px-2.5 text-[13px] outline-none focus-visible:border-primary"
            >
              {timezoneOptions.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4">
          <Label className="mb-1 block text-[11.5px] text-ink-soft">Billing/contact email</Label>
          <Input type="email" value={draft.contact_email} onChange={(e) => setDraft({ ...draft, contact_email: e.target.value })} />
        </div>

        {updateOrg.isError && (
          <p className="mt-3 text-[12px] text-danger">
            {updateOrg.error instanceof ApiError ? updateOrg.error.message : "Couldn't save — try again."}
          </p>
        )}

        <div className="mt-5 flex items-center gap-3">
          <Button type="submit" disabled={!dirty || updateOrg.isPending}>
            {updateOrg.isPending ? "Saving…" : "Save changes"}
          </Button>
          {saved && <span className="text-xs text-success">Saved</span>}
        </div>
      </form>

      {/* Custom usernames */}
      <div className="rounded-[10px] border border-line bg-surface p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="mb-0.5 font-head text-sm text-ink">Allow custom usernames</div>
            <p className="text-[12.5px] text-ink-soft">
              By default every user logs in with their email. Turn this on to let users set their own
              username from their profile — they can still log in with their email either way.
            </p>
          </div>
          <button
            type="button"
            onClick={() => updateOrg.mutate({ allow_custom_username: !org.allow_custom_username })}
            disabled={updateOrg.isPending}
            className={`relative h-6 w-11 flex-shrink-0 rounded-full transition-colors ${org.allow_custom_username ? "bg-primary" : "bg-line"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${org.allow_custom_username ? "translate-x-5" : "translate-x-0.5"}`}
            />
          </button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="rounded-[10px] border border-danger/20 bg-danger-soft p-5">
        <div className="mb-1.5 font-head text-sm text-ink">Danger zone</div>
        {confirmDeactivate ? (
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] text-ink-soft">
              Deactivate {org.name}? Learners lose access immediately; data is kept and can be restored by Riosmart support.
            </span>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button
                onClick={confirmedDeactivate}
                disabled={deactivate.isPending}
                className="rounded-md border border-danger px-3.5 py-2 text-xs font-medium text-danger"
              >
                {deactivate.isPending ? "Deactivating…" : "Confirm"}
              </button>
              <button onClick={() => setConfirmDeactivate(false)} className="text-xs text-ink-faint">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] text-ink-soft">
              Deactivating pauses learner access without deleting any data. Permanent deletion requires contacting Riosmart support.
            </span>
            <button
              onClick={() => setConfirmDeactivate(true)}
              className="ml-3 flex-shrink-0 rounded-md border border-danger px-3.5 py-2 text-xs font-medium text-danger"
            >
              Deactivate organization
            </button>
          </div>
        )}
        {deactivate.isError && (
          <p className="mt-3 flex items-center gap-1.5 text-[12px] text-danger">
            <AlertCircle className="h-3.5 w-3.5" />
            {deactivate.error instanceof ApiError ? deactivate.error.message : "Couldn't deactivate — try again."}
          </p>
        )}
      </div>
    </div>
  );
}

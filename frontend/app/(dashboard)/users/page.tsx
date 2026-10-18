"use client";
import { useRef, useState } from "react";
import {
  Upload, Send, QrCode, Smartphone, ShieldCheck, ShieldQuestion, UserMinus, Check, X, UserCog,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QRCodeSVG } from "@/components/shell/qr-code";
import { UserProfileDialog } from "@/components/shell/users/user-profile-dialog";
import { useMyOrg } from "@/lib/hooks/use-orgs";
import { useTeams } from "@/lib/hooks/use-teams";
import { useProfileFields } from "@/lib/hooks/use-profile-fields";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import {
  useUsers, useInviteUser, useBulkInvite, useChangeRole, useChangeTeam, useUpdateUserStatus, useRemoveUser,
} from "@/lib/hooks/use-users";
import { ApiError } from "@/lib/api-client";
import type { AppUser, BulkInviteResult, ProfileField, RoleName } from "@/lib/types";

const roleOptions: RoleName[] = ["learner", "team_lead", "org_admin"];
const roleLabel: Record<RoleName, string> = { super_admin: "Super Admin", org_admin: "Org Admin", team_lead: "Team Lead", learner: "Learner" };

// A sensible example value per field type, so a downloaded template row
// is something an admin can just overwrite rather than puzzle out. A
// required field gets a value that visibly flags itself as a stand-in
// ("Required - replace", "REQUIRED_TRUE") rather than something that
// looks like real data (an admin who re-uploads the template unedited
// as a test should still get real example users, but notice instantly
// which cells were the ones they had to fill in for real).
function exampleValueFor(field: ProfileField): string {
  const tag = field.required ? "REQUIRED" : "optional";
  switch (field.field_type) {
    case "checkbox":
      return field.required ? "true" : "false";
    case "radio":
    case "select":
      return field.options[0] ?? tag;
    case "textarea":
      return field.required ? "Required - replace with real notes" : "Optional notes";
    default:
      return field.required ? "Required - replace with real value" : "Optional";
  }
}

// One column per field the org has actually defined (keyed by
// shortname — exactly what the backend's CSV reader matches on),
// appended after the four fixed columns, so the template an admin
// downloads always matches what bulk-invite expects right now,
// mandatory fields included. Takes the live field list directly rather
// than trusting a value already in React state, so a template built
// the instant after a field was added/removed is never stale.
function buildCsvTemplate(customFields: ProfileField[]): string {
  const headers = ["name", "email", "team_name", "role", ...customFields.map((f) => f.shortname)];
  const exampleRow = ["Jane Doe", "jane.doe@example.com", "Assembly Line Ops", "learner", ...customFields.map(exampleValueFor)];
  return `${headers.join(",")}\n${exampleRow.join(",")}\n`;
}

function downloadCsvTemplate(customFields: ProfileField[]) {
  const blob = new Blob([buildCsvTemplate(customFields)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "bulk-invite-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

export default function UsersPage() {
  const { data: org } = useMyOrg();
  const { data: teams } = useTeams();
  const { data: users, isLoading } = useUsers();
  const { data: profileFields, isLoading: fieldsLoading, refetch: refetchProfileFields } = useProfileFields();
  const requiredFields = profileFields?.filter((f) => f.required) ?? [];
  const { data: me } = useCurrentUser();
  // Edit + "Login as" are Org-Admin-only on the backend; Team Leads who
  // can also open this page get a read-only view of the same dialog.
  const canEditProfiles = me?.role === "org_admin" || me?.role === "super_admin";
  const [profileUserId, setProfileUserId] = useState<string | null>(null);

  const invite = useInviteUser();
  const bulkInvite = useBulkInvite();
  const changeRole = useChangeRole();
  const changeTeam = useChangeTeam();
  const updateStatus = useUpdateUserStatus();
  const remove = useRemoveUser();

  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteTeamId, setInviteTeamId] = useState("");
  const [inviteRole, setInviteRole] = useState<RoleName>("learner");
  const [inviteSuccess, setInviteSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bulkResult, setBulkResult] = useState<BulkInviteResult | null>(null);

  const [selected, setSelected] = useState<string[]>([]);
  const [bulkTeamId, setBulkTeamId] = useState("");
  const [bulkRole, setBulkRole] = useState<RoleName | "">("");
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const domainRestricted = (org?.allowed_domains?.length ?? 0) > 0;
  const activeCount = users?.filter((u) => u.status !== "suspended" && u.status !== "deactivated").length ?? 0;
  const seatLimit = org?.user_limit ?? 0;
  const atLimit = seatLimit > 0 && activeCount >= seatLimit;
  const suspendedCount = users?.filter((u) => u.status === "suspended").length ?? 0;
  const joinUrl = org ? `https://app.riosmartlms.com/join/${org.slug}` : "";

  const submitInvite = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteName.trim() || !inviteEmail.trim() || atLimit) return;
    invite.mutate(
      { name: inviteName.trim(), email: inviteEmail.trim(), team_id: inviteTeamId || null, role: inviteRole },
      { onSuccess: () => { setInviteName(""); setInviteEmail(""); setInviteTeamId(""); setInviteRole("learner"); setInviteSuccess(true); } }
    );
  };

  const onCsvSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setBulkResult(null);
    bulkInvite.mutate(file, { onSuccess: (result) => setBulkResult(result) });
    e.target.value = "";
  };

  const [isDraggingCsv, setIsDraggingCsv] = useState(false);

  const handleCsvDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingCsv(false);
    if (atLimit) return;
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      alert("Please drop a .csv file.");
      return;
    }
    setBulkResult(null);
    bulkInvite.mutate(file, { onSuccess: (result) => setBulkResult(result) });
  };

  const toggle = (id: string) => setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleAll = () => setSelected(selected.length === (users?.length ?? 0) ? [] : (users?.map((u) => u.id) ?? []));
  const clearSelection = () => {
    setSelected([]);
    setBulkTeamId("");
    setBulkRole("");
    setConfirmBulkRemove(false);
  };

  const reportFailures = (results: PromiseSettledResult<unknown>[], action: string) => {
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) alert(`${action}: ${failed} of ${results.length} failed (likely your own account, which can't be changed this way).`);
  };

  const applyBulkTeam = async () => {
    if (!bulkTeamId) return;
    const results = await Promise.allSettled(selected.map((id) => changeTeam.mutateAsync({ id, team_id: bulkTeamId })));
    reportFailures(results, "Move to team");
    clearSelection();
  };
  const applyBulkRole = async () => {
    if (!bulkRole) return;
    const results = await Promise.allSettled(selected.map((id) => changeRole.mutateAsync({ id, role: bulkRole })));
    reportFailures(results, "Change role");
    clearSelection();
  };
  const applyBulkSuspend = async () => {
    const results = await Promise.allSettled(selected.map((id) => updateStatus.mutateAsync({ id, status: "suspended" })));
    reportFailures(results, "Suspend");
    clearSelection();
  };
  const applyBulkRemove = async () => {
    const results = await Promise.allSettled(selected.map((id) => remove.mutateAsync(id)));
    reportFailures(results, "Remove");
    clearSelection();
  };

  return (
    <div className="p-8">
      <h1 className="mb-6 font-head text-xl text-ink">Users &amp; Access</h1>

      {/* Seat usage banner */}
      <div className={`mb-5 flex items-center gap-3 rounded-lg border px-4 py-3 ${atLimit ? "border-danger bg-danger-soft" : "border-line bg-surface"}`}>
        <ShieldCheck className={`h-4 w-4 flex-shrink-0 ${atLimit ? "text-danger" : "text-ink-soft"}`} />
        <div className="flex-1">
          <div className="text-[13px] font-medium text-ink">{activeCount} of {seatLimit} seats used</div>
          <div className="text-[11px] text-ink-faint">
            Suspended or removed users don&apos;t count against your limit{suspendedCount > 0 ? ` — ${suspendedCount} currently suspended` : ""}.
          </div>
        </div>
        <div className="h-1.5 w-24 flex-shrink-0 rounded-full bg-line-soft">
          <div
            className={`h-1.5 rounded-full ${atLimit ? "bg-danger" : activeCount / (seatLimit || 1) > 0.8 ? "bg-amber" : "bg-primary"}`}
            style={{ width: `${Math.min(100, (activeCount / (seatLimit || 1)) * 100)}%` }}
          />
        </div>
      </div>

      {/* Invite tools */}
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        {/* Bulk CSV */}
        <div
          onDragOver={(e) => { e.preventDefault(); if (!atLimit) setIsDraggingCsv(true); }}
          onDragLeave={() => setIsDraggingCsv(false)}
          onDrop={handleCsvDrop}
          className={`flex flex-col items-center justify-center rounded-xl border border-dashed p-6 text-center transition-colors ${
            isDraggingCsv ? "border-primary bg-primary-soft" : "border-line bg-surface"
          }`}
        >
          <Upload className="h-5 w-5 text-ink-faint" />
          <div className="mt-2.5 text-[13px] text-ink">Drop a CSV to bulk-invite learners</div>
          <div className="mt-1 text-xs text-ink-faint">
            Assigns team and role automatically from the file{domainRestricted ? ` — rows outside ${org!.allowed_domains.map((d) => "@" + d).join("/")} are skipped` : ""}
          </div>
          {requiredFields.length > 0 && (
            <div className="mt-1 text-[11px] text-ink-faint">
              Must also include: {requiredFields.map((f) => f.shortname).join(", ")}
            </div>
          )}
          {atLimit ? (
            <div className="mt-2.5 text-[11.5px] text-danger">Blocked — no seats left</div>
          ) : (
            <>
              <button onClick={() => fileInputRef.current?.click()} className="mt-2.5 text-xs font-medium text-primary">
                {bulkInvite.isPending ? "Uploading…" : "Choose CSV file"}
              </button>
              <button
                onClick={async () => {
                  // Org fields can be added/removed at any time, so pull
                  // the latest list right before building the file
                  // instead of trusting whatever happened to be cached —
                  // a stale template missing a newly-required column is
                  // exactly the "mandatory field nahi bana" bug this is
                  // meant to prevent.
                  const fresh = await refetchProfileFields();
                  downloadCsvTemplate(fresh.data ?? profileFields ?? []);
                }}
                disabled={fieldsLoading}
                className="mt-1 text-[11px] text-ink-faint underline disabled:opacity-50"
              >
                Download template
              </button>
              <input ref={fileInputRef} type="file" accept=".csv" onChange={onCsvSelected} className="hidden" />
            </>
          )}
          {bulkResult && (
            <div className="mt-3 w-full rounded-lg bg-paper p-2.5 text-left text-[11px] text-ink-soft">
              <div className="font-medium text-success">{bulkResult.invited} invited</div>
              {bulkResult.invited > 0 && (
                <div className="mt-0.5">
                  All start on <span className="font-mono">Password@123</span> — they&apos;ll set their own on first login.
                </div>
              )}
              {bulkResult.skipped.length > 0 && <div>{bulkResult.skipped.length} already registered</div>}
              {bulkResult.domain_rejected.length > 0 && <div>{bulkResult.domain_rejected.length} outside allowed domain</div>}
              {bulkResult.seat_limited.length > 0 && <div>{bulkResult.seat_limited.length} skipped — no seats left</div>}
            </div>
          )}
          {bulkInvite.isError && (
            <div className="mt-2 text-[11px] text-danger">
              {bulkInvite.error instanceof ApiError ? bulkInvite.error.message : "Upload failed."}
            </div>
          )}
        </div>

        {/* Create one user */}
        <form onSubmit={submitInvite} className="rounded-xl border border-line bg-surface p-5">
          <div className="mb-1 font-head text-sm text-ink">Create a user</div>
          {domainRestricted && (
            <div className="mb-2.5 text-[11px] text-ink-faint">Only {org!.allowed_domains.map((d) => "@" + d).join(", ")} emails allowed</div>
          )}
          <div className="flex flex-col gap-2.5">
            <Input
              placeholder="Full name"
              value={inviteName}
              disabled={atLimit}
              onChange={(e) => { setInviteName(e.target.value); setInviteSuccess(false); }}
            />
            <Input
              placeholder="Work email"
              type="email"
              value={inviteEmail}
              disabled={atLimit}
              onChange={(e) => { setInviteEmail(e.target.value); setInviteSuccess(false); }}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as RoleName)}
              disabled={atLimit}
              className="h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none disabled:opacity-50"
            >
              {roleOptions.map((r) => (
                <option key={r} value={r}>{roleLabel[r]}</option>
              ))}
            </select>
            <select
              value={inviteTeamId}
              onChange={(e) => setInviteTeamId(e.target.value)}
              disabled={atLimit}
              className="h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none disabled:opacity-50"
            >
              <option value="">No team</option>
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
            <Button type="submit" disabled={atLimit || !inviteName.trim() || !inviteEmail.trim() || invite.isPending} className="self-start">
              {invite.isPending ? "Creating…" : "Create user"}
            </Button>
            {invite.isError && (
              <span className="text-[11.5px] text-danger">
                {invite.error instanceof ApiError ? invite.error.message : "Couldn't create that user."}
              </span>
            )}
            {inviteSuccess && !invite.isError && (
              <div className="rounded-lg bg-primary-soft px-2.5 py-2 text-[11.5px] text-ink-soft">
                Account created. Share the temporary password <span className="font-mono font-medium">Password@123</span> with
                them — they&apos;ll be asked to set their own on first login.
              </div>
            )}
          </div>
        </form>

        {/* QR invite */}
        <div className="flex flex-col items-center rounded-xl border border-line bg-surface p-6 text-center">
          <div className="mb-3 flex items-center gap-1.5 self-start">
            <QrCode className="h-3.5 w-3.5 text-primary" />
            <span className="font-head text-sm text-ink">Scan to join</span>
          </div>
          {joinUrl && <QRCodeSVG value={joinUrl} size={140} />}
          <div className="mt-3 flex items-center gap-1.5">
            <Smartphone className="h-3 w-3 text-ink-faint" />
            <span className="text-[11.5px] text-ink-faint">Opens the Riosmart app — installs on any phone</span>
          </div>
          <div className="mt-3 flex w-full items-center gap-2 rounded-md bg-paper px-2.5 py-2">
            <span className="flex-1 truncate text-left text-[11px] text-ink-soft">{joinUrl}</span>
            <button
              onClick={() => joinUrl && navigator.clipboard.writeText(joinUrl)}
              className="flex-shrink-0 text-[11px] font-semibold text-primary"
            >
              Copy
            </button>
          </div>
          <span className="mt-2 text-[10.5px] text-ink-faint">Good for a printed poster at a shift-floor kiosk</span>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl bg-ink px-4 py-3">
          <span className="text-[12.5px] font-semibold text-white">{selected.length} selected</span>

          <select
            value={bulkTeamId}
            onChange={(e) => setBulkTeamId(e.target.value)}
            className="rounded-md border-none bg-white/10 px-2 py-1.5 text-xs text-white"
          >
            <option value="">Move to team…</option>
            {teams?.map((t) => (
              <option key={t.id} value={t.id} className="text-ink">{t.name}</option>
            ))}
          </select>
          <button onClick={applyBulkTeam} disabled={!bulkTeamId} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:bg-white/10 disabled:text-white/40">
            Apply
          </button>

          <div className="h-5 w-px bg-white/15" />

          <select
            value={bulkRole}
            onChange={(e) => setBulkRole(e.target.value as RoleName)}
            className="rounded-md border-none bg-white/10 px-2 py-1.5 text-xs text-white"
          >
            <option value="">Change role…</option>
            {roleOptions.map((r) => (
              <option key={r} value={r} className="text-ink">{roleLabel[r]}</option>
            ))}
          </select>
          <button onClick={applyBulkRole} disabled={!bulkRole} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white disabled:bg-white/10 disabled:text-white/40">
            Apply
          </button>

          <div className="h-5 w-px bg-white/15" />

          <button onClick={applyBulkSuspend} className="flex items-center gap-1.5 px-3 py-1.5">
            <ShieldQuestion className="h-3.5 w-3.5" style={{ color: "#FFC98A" }} />
            <span className="text-xs font-medium" style={{ color: "#FFC98A" }}>Suspend selected</span>
          </button>

          <div className="h-5 w-px bg-white/15" />

          {confirmBulkRemove ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-white">Remove {selected.length} users?</span>
              <button onClick={applyBulkRemove} className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white">Confirm</button>
              <button onClick={() => setConfirmBulkRemove(false)} className="text-xs text-white/60">Cancel</button>
            </div>
          ) : (
            <button onClick={() => setConfirmBulkRemove(true)} className="flex items-center gap-1.5 px-3 py-1.5">
              <UserMinus className="h-3.5 w-3.5" style={{ color: "#FF8FA3" }} />
              <span className="text-xs font-medium" style={{ color: "#FF8FA3" }}>Remove selected</span>
            </button>
          )}

          <button onClick={clearSelection} className="ml-auto text-xs text-white/60">Clear</button>
        </div>
      )}

      {/* Users table */}
      <div className="rounded-xl border border-line bg-surface">
        <div className="border-b border-line-soft px-5 py-3.5">
          <span className="font-head text-[14.5px] text-ink">All users ({users?.length ?? 0}) · {activeCount} active</span>
        </div>

        {isLoading && <p className="p-5 text-sm text-ink-faint">Loading users…</p>}

        {!isLoading && (
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="w-9 border-b border-line-soft px-5 py-2.5">
                  <button
                    onClick={toggleAll}
                    className={`flex h-4 w-4 items-center justify-center rounded ${selected.length > 0 && selected.length === users?.length ? "bg-primary" : "border border-line"}`}
                  >
                    {selected.length > 0 && selected.length === users?.length && <Check className="h-2.5 w-2.5 text-white" />}
                  </button>
                </th>
                {["Name", "Team", "Role", "Progress", "Actions"].map((h) => (
                  <th key={h} className="border-b border-line-soft px-5 py-2.5 text-left text-[11.5px] font-medium text-ink-faint">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users?.map((u: AppUser) => {
                const suspended = u.status === "suspended";
                const isSelf = false; // backend enforces the real check; this just avoids an obviously-broken row for now
                return (
                  <tr key={u.id} className={selected.includes(u.id) ? "bg-primary-soft" : ""} style={{ opacity: suspended ? 0.6 : 1 }}>
                    <td className="border-b border-line-soft px-5 py-3">
                      <button
                        onClick={() => toggle(u.id)}
                        className={`flex h-4 w-4 items-center justify-center rounded ${selected.includes(u.id) ? "bg-primary" : "border border-line"}`}
                      >
                        {selected.includes(u.id) && <Check className="h-2.5 w-2.5 text-white" />}
                      </button>
                    </td>
                    <td className="border-b border-line-soft px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setProfileUserId(u.id)}
                          className="font-medium text-ink underline-offset-2 hover:text-primary hover:underline"
                          title={canEditProfiles ? "View / edit profile" : "View profile"}
                        >
                          {u.full_name}
                        </button>
                        {suspended && <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[10px] text-amber">Suspended</span>}
                        {u.status === "invited" && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10px] text-primary">Invited</span>}
                      </div>
                      <div className="text-[11.5px] text-ink-faint">{u.email}</div>
                    </td>
                    <td className="border-b border-line-soft px-5 py-3 text-ink-soft">{u.team_name ?? "—"}</td>
                    <td className="border-b border-line-soft px-5 py-3">
                      <select
                        value={u.role}
                        disabled={isSelf}
                        onChange={(e) => changeRole.mutate({ id: u.id, role: e.target.value as RoleName })}
                        className="rounded-md border border-line px-2 py-1 text-xs text-ink"
                      >
                        {roleOptions.map((r) => (
                          <option key={r} value={r}>{roleLabel[r]}</option>
                        ))}
                      </select>
                    </td>
                    <td className="border-b border-line-soft px-5 py-3 text-xs text-ink-faint" title="Course progress tracking isn't built yet">—</td>
                    <td className="border-b border-line-soft px-5 py-3">
                      {confirmDeleteId === u.id ? (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-ink-soft">Remove?</span>
                          <button onClick={() => { remove.mutate(u.id); setConfirmDeleteId(null); }} className="text-danger"><Check className="h-3.5 w-3.5" /></button>
                          <button onClick={() => setConfirmDeleteId(null)} className="text-ink-faint"><X className="h-3.5 w-3.5" /></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button title="View / edit profile" onClick={() => setProfileUserId(u.id)}>
                            <UserCog className="h-3.5 w-3.5 text-ink-soft" />
                          </button>
                          <button
                            title={suspended ? "Reactivate" : "Suspend"}
                            onClick={() => updateStatus.mutate({ id: u.id, status: suspended ? "active" : "suspended" })}
                          >
                            <ShieldQuestion className="h-3.5 w-3.5 text-amber" />
                          </button>
                          <button title="Remove" onClick={() => setConfirmDeleteId(u.id)}>
                            <UserMinus className="h-3.5 w-3.5 text-danger" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <UserProfileDialog userId={profileUserId} canEdit={canEditProfiles} onClose={() => setProfileUserId(null)} />
    </div>
  );
}

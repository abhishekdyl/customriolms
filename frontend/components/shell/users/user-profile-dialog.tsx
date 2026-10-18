"use client";
import { useEffect, useState } from "react";
import { LogIn } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUser, useUpdateUserProfile } from "@/lib/hooks/use-users";
import { useLoginAs } from "@/lib/hooks/use-auth";
import { useUserCustomFields, useUpdateUserCustomFields } from "@/lib/hooks/use-profile-fields";
import { useTeams } from "@/lib/hooks/use-teams";
import { ApiError } from "@/lib/api-client";
import type { RoleName } from "@/lib/types";

const roleOptions: RoleName[] = ["learner", "team_lead", "org_admin"];
const roleLabel: Record<RoleName, string> = { super_admin: "Super Admin", org_admin: "Org Admin", team_lead: "Team Lead", learner: "Learner" };

// Same restriction as the backend (_IMPERSONATABLE_ROLES in users.py) —
// never let an Org Admin "become" another admin or platform staff from
// here. Kept in sync manually since this is UI-only; the server enforces
// the real rule regardless of what this button shows.
const IMPERSONATABLE_ROLES: RoleName[] = ["team_lead", "learner"];

/** The Org Admin's "view / edit profile" panel for one user, plus the
 * "Login as" switch. Team Leads can open it too (read-only — the save
 * and login-as actions aren't offered to them since the backend
 * endpoints are Org-Admin-only). */
export function UserProfileDialog({
  userId, canEdit, onClose,
}: {
  userId: string | null;
  canEdit: boolean;
  onClose: () => void;
}) {
  const { data: user, isLoading } = useUser(userId);
  const { data: teams } = useTeams();
  const { data: customFields } = useUserCustomFields(userId);
  const updateProfile = useUpdateUserProfile();
  const updateCustomFields = useUpdateUserCustomFields(userId);
  const loginAs = useLoginAs();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<RoleName>("learner");
  const [teamId, setTeamId] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [bio, setBio] = useState("");
  const [country, setCountry] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  // Re-seed the form whenever a different user's data finishes loading —
  // not on every render, so typing isn't clobbered by a background refetch.
  useEffect(() => {
    if (!user) return;
    setName(user.full_name);
    setEmail(user.email);
    setRole(user.role);
    setTeamId(user.team_id ?? "");
    setPhone(user.phone ?? "");
    setJobTitle(user.job_title ?? "");
    setLocation(user.location ?? "");
    setBio(user.bio ?? "");
    setCountry(user.country ?? "");
    setSaved(false);
  }, [user?.id]);

  useEffect(() => {
    if (!customFields) return;
    setFieldValues(Object.fromEntries(customFields.map((f) => [f.shortname, f.value ?? ""])));
  }, [customFields]);

  if (!userId) return null;

  const handleSave = () => {
    if (!name.trim() || !email.trim()) return;
    setSaved(false);
    updateProfile.mutate(
      {
        id: userId, name: name.trim(), email: email.trim(), role, team_id: teamId || null,
        phone: phone || null, job_title: jobTitle || null, location: location || null, bio: bio || null, country: country || null,
      },
      {
        onSuccess: () => {
          if (customFields && customFields.length > 0) {
            updateCustomFields.mutate(fieldValues, { onSuccess: () => setSaved(true) });
          } else {
            setSaved(true);
          }
        },
      },
    );
  };

  const error = updateProfile.error ?? updateCustomFields.error ?? loginAs.error;

  return (
    <Dialog open={!!userId} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{canEdit ? "Edit profile" : "View profile"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4 p-6">
          {isLoading && <p className="text-sm text-ink-faint">Loading…</p>}
          {user && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-faint">Full name *</span>
                  <Input value={name} disabled={!canEdit} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-faint">Email *</span>
                  <Input type="email" value={email} disabled={!canEdit} onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-faint">Role *</span>
                  <select
                    value={role} disabled={!canEdit} onChange={(e) => setRole(e.target.value as RoleName)}
                    className="h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none disabled:opacity-60"
                  >
                    {roleOptions.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-faint">Team</span>
                  <select
                    value={teamId} disabled={!canEdit} onChange={(e) => setTeamId(e.target.value)}
                    className="h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none disabled:opacity-60"
                  >
                    <option value="">No team</option>
                    {teams?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-faint">Phone</span>
                  <Input value={phone} disabled={!canEdit} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-faint">Job title</span>
                  <Input value={jobTitle} disabled={!canEdit} onChange={(e) => setJobTitle(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-faint">Location</span>
                  <Input value={location} disabled={!canEdit} onChange={(e) => setLocation(e.target.value)} />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-faint">Country</span>
                  <Input value={country} disabled={!canEdit} onChange={(e) => setCountry(e.target.value)} />
                </label>
                <label className="col-span-2 flex flex-col gap-1">
                  <span className="text-[11px] font-medium text-ink-faint">Bio</span>
                  <Input value={bio} disabled={!canEdit} onChange={(e) => setBio(e.target.value)} />
                </label>
              </div>

              {customFields && customFields.length > 0 && (
                <div className="flex flex-col gap-2.5 border-t border-line-soft pt-3">
                  <span className="text-[11px] font-medium text-ink-faint">Org custom fields</span>
                  {customFields.map((f) => (
                    <label key={f.id} className="flex flex-col gap-1">
                      <span className="text-[11px] text-ink-soft">{f.name}{f.required ? " *" : ""}</span>
                      {f.field_type === "select" || f.field_type === "radio" ? (
                        <select
                          value={fieldValues[f.shortname] ?? ""} disabled={!canEdit}
                          onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.shortname]: e.target.value }))}
                          className="h-10 rounded-lg border border-line bg-surface px-3 text-sm outline-none disabled:opacity-60"
                        >
                          <option value="">—</option>
                          {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <Input
                          value={fieldValues[f.shortname] ?? ""} disabled={!canEdit}
                          onChange={(e) => setFieldValues((prev) => ({ ...prev, [f.shortname]: e.target.value }))}
                        />
                      )}
                    </label>
                  ))}
                </div>
              )}

              {error && (
                <p className="text-[11.5px] text-danger">{error instanceof ApiError ? error.message : "Something went wrong."}</p>
              )}
              {saved && !error && <p className="text-[11.5px] text-success">Saved.</p>}

              <div className="flex items-center justify-between gap-3 border-t border-line-soft pt-4">
                {canEdit && IMPERSONATABLE_ROLES.includes(user.role) && user.status === "active" ? (
                  <Button
                    type="button" variant="secondary"
                    onClick={() => loginAs.mutate(user.id)}
                    disabled={loginAs.isPending}
                  >
                    <LogIn className="mr-1.5 h-3.5 w-3.5" />
                    {loginAs.isPending ? "Switching…" : "Login as this user"}
                  </Button>
                ) : (
                  <span />
                )}
                {canEdit && (
                  <Button type="button" onClick={handleSave} disabled={updateProfile.isPending || !name.trim() || !email.trim()}>
                    {updateProfile.isPending ? "Saving…" : "Save changes"}
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

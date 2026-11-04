"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomFieldInput } from "@/components/shell/custom-field-input";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { useMyCustomFields, useUpdateMyCustomFields } from "@/lib/hooks/use-profile-fields";
import { roleHome } from "@/lib/role-home";
import { ApiError } from "@/lib/api-client";

/**
 * The self-service counterpart to the Org Admin's "edit profile" dialog
 * on the Users page (that one can't target yourself — see
 * update_user_profile's docstring) — just this org's custom field
 * values, which is the one thing AuthGuard can force someone here for
 * when an Org Admin marked one mandatory (see profilePath in
 * lib/role-home). A learner has their own fuller version of this at
 * .../learn/profile; every other role (Org Admin, Team Lead, a custom
 * role, Super Admin) lands here instead — rendered by both
 * app/(dashboard)/profile (Super Admin, unprefixed) and
 * app/[org]/(dashboard)/profile (everyone else), since the logic is
 * identical either way.
 */
export function ProfileFieldsPage() {
  const router = useRouter();
  const { data: user } = useCurrentUser();
  const { data: fields, isLoading } = useMyCustomFields();
  const update = useUpdateMyCustomFields();
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (fields) setDraft(Object.fromEntries(fields.map((f) => [f.shortname, f.value ?? ""])));
  }, [fields]);

  const missingRequired = fields?.filter((f) => f.required && !(draft[f.shortname] ?? "").trim()) ?? [];
  const cameHereForced = fields?.some((f) => f.required && !(f.value ?? "").trim());

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (missingRequired.length > 0) return;
    setSaved(false);
    update.mutate(draft, {
      onSuccess: () => {
        setSaved(true);
        // Nothing left to fill in — send them on to wherever they were
        // actually headed, same as /change-password does once that's done.
        if (cameHereForced && user) router.push(roleHome(user.role, user.org_slug));
      },
    });
  };

  if (!fields && isLoading) {
    return <div className="p-8 text-sm text-ink-faint">Loading…</div>;
  }

  if (!fields || fields.length === 0) {
    return (
      <div className="max-w-[560px] p-5 md:p-8">
        <h1 className="mb-2 font-head text-xl text-ink">Your profile</h1>
        <p className="text-sm text-ink-faint">Your org hasn&apos;t defined any custom profile fields yet.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[560px] overflow-auto p-5 md:p-8">
      <h1 className="mb-1 font-head text-xl text-ink">Your profile</h1>
      <p className="mb-6 text-sm text-ink-faint">
        Extra details your organization asks every user for, beyond name and email.
      </p>

      {cameHereForced && (
        <div className="mb-5 flex items-start gap-2.5 rounded-lg border border-amber/30 bg-amber/10 p-4">
          <ShieldAlert className="mt-0.5 h-4 w-4 flex-shrink-0 text-amber" />
          <p className="text-[13px] text-ink">
            Your organization requires the field(s) marked <span className="text-danger">*</span> below before you
            can continue.
          </p>
        </div>
      )}

      <form onSubmit={submit} className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface p-6">
        {fields.map((f) => (
          <div key={f.id} className="flex flex-col gap-1.5">
            <label className="text-[12.5px] font-medium text-ink-soft">
              {f.name} {f.required && <span className="text-danger">*</span>}
            </label>
            <CustomFieldInput
              field={f}
              value={draft[f.shortname] ?? ""}
              onChange={(v) => setDraft((prev) => ({ ...prev, [f.shortname]: v }))}
            />
          </div>
        ))}

        {update.isError && (
          <p className="text-[12.5px] text-danger">
            {update.error instanceof ApiError ? update.error.message : "Couldn't save — try again."}
          </p>
        )}

        <div className="flex items-center gap-3 border-t border-line-soft pt-4">
          <Button type="submit" disabled={missingRequired.length > 0 || update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
          {saved && !update.isError && !cameHereForced && <span className="text-xs text-success">Saved.</span>}
        </div>
      </form>
    </div>
  );
}

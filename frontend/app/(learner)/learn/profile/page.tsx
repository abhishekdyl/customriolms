"use client";

import { useEffect, useState } from "react";
import { Check, Eye, EyeOff, Lock, LogOut, User as UserIcon } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError } from "@/lib/api-client";
import { useChangePassword, useCurrentUser, useLogoutAll, useUpdateProfile, useUploadAvatar } from "@/lib/hooks/use-auth";
import { useMyOrg } from "@/lib/hooks/use-orgs";
import { useLearnerProfile, useUpdateLearnerProfile } from "@/lib/hooks/use-learner-profile";

const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin",
  org_admin: "Org Admin",
  team_lead: "Team Lead",
  learner: "Learner",
};

function Card({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-[14px] border border-line bg-surface p-5">
      <h2 className="font-head text-[14.5px] text-ink">{title}</h2>
      {hint && <p className="mt-0.5 text-[12px] text-ink-faint">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Message({ kind, children }: { kind: "ok" | "error"; children: React.ReactNode }) {
  return (
    <p className={kind === "ok" ? "flex items-center gap-1.5 text-[12.5px] text-success" : "text-[12.5px] text-danger"}>
      {kind === "ok" && <Check size={13} />}
      {children}
    </p>
  );
}

/** Backend validation errors can arrive as a list; always show readable text. */
function errorText(e: unknown, fallback: string) {
  return e instanceof ApiError && typeof e.message === "string" && !e.message.startsWith("[") ? e.message : fallback;
}

function DetailsCard() {
  const { data: user } = useCurrentUser();
  const { data: org } = useMyOrg();
  const { data: profile } = useLearnerProfile();
  const update = useUpdateProfile();
  const updateProfile = useUpdateLearnerProfile();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [city, setCity] = useState("");
  const [timezone, setTimezone] = useState("");
  const [companyname, setCompanyname] = useState("");
  const [country, setCountry] = useState("");
  const [saved, setSaved] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  // Seed the fields once the profile has loaded.
  useEffect(() => {
    if (user) {
      setName(user.full_name);
      setUsername(user.username);
      setCity(user.city ?? "");
      setTimezone(user.timezone ?? "");
      setCompanyname(user.companyname ?? "");
    }
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (profile) setCountry(profile.country ?? "");
  }, [profile?.country]);

  const clean = name.trim().replace(/\s+/g, " ");
  const cleanUsername = username.trim();
  const cleanCountry = country.trim();
  const dirty =
    (!!user &&
      (clean !== user.full_name ||
        cleanUsername !== user.username ||
        city.trim() !== (user.city ?? "") ||
        timezone.trim() !== (user.timezone ?? "") ||
        companyname.trim() !== (user.companyname ?? ""))) ||
    (!!profile && cleanCountry !== (profile.country ?? ""));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setSaved(false);
    if (!clean) {
      setLocalError("Please enter your name.");
      return;
    }
    setLocalError(null);
    if (user) {
      const [firstname, ...rest] = clean.split(/\s+/);
      update.mutate(
        {
          firstname,
          lastname: rest.join(" "),
          username: org?.allow_custom_username ? cleanUsername : undefined,
          city: city.trim() || null,
          timezone: timezone.trim() || null,
          companyname: companyname.trim() || null,
        },
        { onSuccess: (me) => { setName(me.full_name); setUsername(me.username); } }
      );
    }
    if (profile && cleanCountry !== (profile.country ?? "")) {
      updateProfile.mutate({ country: cleanCountry || null }, { onSuccess: (p) => setCountry(p.country ?? "") });
    }
    setSaved(true);
  };

  return (
    <Card title="Your details">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="name">Full name</Label>
          <Input
            id="name"
            value={name}
            maxLength={200}
            onChange={(e) => { setName(e.target.value); setSaved(false); setLocalError(null); }}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" value={user?.email ?? ""} disabled readOnly className="mt-1.5" />
          <p className="mt-1 text-[11.5px] text-ink-faint">This is your login. Ask your admin if it needs to change.</p>
        </div>

        <div>
          <Label htmlFor="username">Username</Label>
          <Input
            id="username"
            value={username}
            maxLength={255}
            disabled={!org?.allow_custom_username}
            onChange={(e) => { setUsername(e.target.value); setSaved(false); setLocalError(null); }}
            className="mt-1.5"
          />
          <p className="mt-1 text-[11.5px] text-ink-faint">
            {org?.allow_custom_username
              ? "You can log in with this username instead of your email."
              : "Your organization hasn't turned on custom usernames yet — this mirrors your email."}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="team">Team</Label>
            <Input id="team" value={user?.team_name ?? "—"} disabled readOnly className="mt-1.5" />
          </div>
          <div>
            <Label htmlFor="role">Role</Label>
            <Input id="role" value={user ? ROLE_LABEL[user.role] ?? user.role : ""} disabled readOnly className="mt-1.5" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="city">City</Label>
            <Input
              id="city" value={city} maxLength={100}
              onChange={(e) => { setCity(e.target.value); setSaved(false); setLocalError(null); }}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="country">Country</Label>
            <Input
              id="country"
              value={country}
              maxLength={100}
              placeholder="e.g. China"
              onChange={(e) => { setCountry(e.target.value); setSaved(false); setLocalError(null); }}
              className="mt-1.5"
            />
          </div>
        </div>
        <p className="-mt-2 text-[11.5px] text-ink-faint">Some course modules are only available to learners from a specific country.</p>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="timezone">Timezone</Label>
            <Input
              id="timezone" value={timezone} maxLength={50} placeholder="e.g. Asia/Kolkata"
              onChange={(e) => { setTimezone(e.target.value); setSaved(false); setLocalError(null); }}
              className="mt-1.5"
            />
          </div>
          <div>
            <Label htmlFor="companyname">Company</Label>
            <Input
              id="companyname" value={companyname} maxLength={200}
              onChange={(e) => { setCompanyname(e.target.value); setSaved(false); setLocalError(null); }}
              className="mt-1.5"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={!dirty || update.isPending || updateProfile.isPending}>
            {update.isPending || updateProfile.isPending ? "Saving…" : "Save changes"}
          </Button>
          {saved && !dirty && <Message kind="ok">Saved</Message>}
          {(localError || update.isError || updateProfile.isError) && (
            <Message kind="error">{localError ?? errorText(update.error ?? updateProfile.error, "Couldn’t save. Please try again.")}</Message>
          )}
        </div>
      </form>
    </Card>
  );
}

function PasswordCard() {
  const change = useChangePassword({ redirectAfter: false });
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setDone(false);
    if (next.length < 8) return setLocalError("New password must be at least 8 characters.");
    if (next !== confirm) return setLocalError("New passwords don’t match.");
    setLocalError(null);
    change.mutate(
      { current_password: current, new_password: next },
      { onSuccess: () => { setDone(true); setCurrent(""); setNext(""); setConfirm(""); } }
    );
  };

  const type = show ? "text" : "password";
  return (
    <Card title="Password" hint="Changing it signs you out on your other devices.">
      <form onSubmit={submit} className="flex flex-col gap-4">
        <div>
          <Label htmlFor="cur">Current password</Label>
          <div className="relative mt-1.5">
            <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-faint" />
            <Input id="cur" type={type} value={current} onChange={(e) => setCurrent(e.target.value)} className="pl-9 pr-9" autoComplete="current-password" required />
            <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide passwords" : "Show passwords"} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
              {show ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="new">New password</Label>
            <Input id="new" type={type} value={next} onChange={(e) => setNext(e.target.value)} className="mt-1.5" autoComplete="new-password" minLength={8} required />
          </div>
          <div>
            <Label htmlFor="confirm">Confirm new password</Label>
            <Input id="confirm" type={type} value={confirm} onChange={(e) => setConfirm(e.target.value)} className="mt-1.5" autoComplete="new-password" minLength={8} required />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={change.isPending || !current || !next || !confirm}>
            {change.isPending ? "Updating…" : "Update password"}
          </Button>
          {done && <Message kind="ok">Password updated</Message>}
          {(localError || change.isError) && (
            <Message kind="error">{localError ?? errorText(change.error, "Couldn’t update your password.")}</Message>
          )}
        </div>
      </form>
    </Card>
  );
}

function SessionsCard() {
  const logoutAll = useLogoutAll();
  const [confirming, setConfirming] = useState(false);
  return (
    <Card title="Devices" hint="Signed in somewhere you don’t recognise, or lost a device? End every session.">
      {confirming ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] text-ink-soft">Log out everywhere, including here?</span>
          <Button variant="secondary" onClick={() => logoutAll.mutate()} disabled={logoutAll.isPending}>
            {logoutAll.isPending ? "Logging out…" : "Yes, log out everywhere"}
          </Button>
          <button type="button" onClick={() => setConfirming(false)} className="text-[12.5px] text-ink-faint">
            Cancel
          </button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}>
          <LogOut size={14} className="mr-2" /> Log out of all devices
        </Button>
      )}
      {logoutAll.isError && <div className="mt-2"><Message kind="error">Couldn’t log out. Please try again.</Message></div>}
    </Card>
  );
}

export default function ProfilePage() {
  const { data: user } = useCurrentUser();
  const uploadAvatar = useUploadAvatar();
  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "";

  const onPickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) uploadAvatar.mutate(file);
    e.target.value = "";
  };

  return (
    <>
      <Topbar title="Profile" />
      <div className="mx-auto w-full max-w-[640px] flex-1 px-4 pb-8 pt-5 md:px-8 md:pt-6">
        {/* header — same avatar block as the prototype */}
        <div className="mb-6 flex flex-col items-center">
          <label className="group relative mb-2 flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-amber">
            {user?.profile_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.profile_image_url} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : initials ? (
              <span className="font-head text-xl text-white">{initials}</span>
            ) : (
              <UserIcon size={24} color="#fff" />
            )}
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100">
              {uploadAvatar.isPending ? "Uploading\u2026" : "Change"}
            </span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={onPickAvatar} />
          </label>
          <div className="font-head text-base text-ink">{user?.full_name ?? "\u00A0"}</div>
          <div className="text-[12.5px] text-ink-faint">{user?.team_name ?? "No team yet"}</div>
          {uploadAvatar.isError && <p className="mt-1 text-[11.5px] text-danger">Couldn\u2019t upload \u2014 try a smaller image.</p>}
        </div>

        <DetailsCard />
        <PasswordCard />
        <SessionsCard />
      </div>
    </>
  );
}

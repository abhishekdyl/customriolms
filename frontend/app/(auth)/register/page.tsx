"use client";
import { useState } from "react";
import Link from "next/link";
import { Building2, Mail, Lock, AlertCircle, User as UserIcon, Hash, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister, useLookupOrg, useRegisterUser } from "@/lib/hooks/use-auth";
import { usePlatformStatus } from "@/lib/hooks/use-orgs";
import { ApiError } from "@/lib/api-client";
import { GoogleSignInButton } from "@/components/shell/auth/google-sign-in-button";
import { CustomFieldInput } from "@/components/shell/custom-field-input";

type Mode = "org" | "user";

export default function RegisterPage() {
  const [mode, setMode] = useState<Mode>("org");

  return (
    <div className="flex min-h-screen items-center justify-center bg-paper p-8">
      <div className="w-full max-w-[380px]">
        {/* Segmented toggle — the only place in this codebase switching
         * between two forms like this, so it's a plain two-button bar
         * rather than borrowing a Tabs/ToggleGroup component that
         * doesn't exist yet elsewhere. */}
        <div className="mb-6 flex rounded-lg border border-line bg-surface p-1">
          <button
            type="button"
            onClick={() => setMode("org")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === "org" ? "bg-primary text-white" : "text-ink-faint hover:text-ink"}`}
          >
            Register organisation
          </button>
          <button
            type="button"
            onClick={() => setMode("user")}
            className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${mode === "user" ? "bg-primary text-white" : "text-ink-faint hover:text-ink"}`}
          >
            Register as a user
          </button>
        </div>

        {mode === "org" ? <OrgRegisterForm /> : <UserRegisterForm />}

        <div className="flex items-center justify-center gap-1.5 pt-6">
          <span className="text-xs text-ink-faint">Already have an account?</span>
          <Link href="/login" className="text-xs font-semibold text-primary">Log in</Link>
        </div>
      </div>
    </div>
  );
}

function OrgRegisterForm() {
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const register = useRegister();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!orgName) e2.orgName = "Organization name is required";
    if (!name) e2.name = "Your name is required";
    if (!/\S+@\S+\.\S+/.test(email)) e2.email = "Enter a valid email address";
    if (password.length < 8) e2.password = "At least 8 characters";
    setErrors(e2);
    if (Object.keys(e2).length) return;
    register.mutate({ org_name: orgName, name, email, password });
  };

  return (
    <form onSubmit={submit}>
      <h2 className="font-head text-2xl text-ink mb-1.5">Create your organization</h2>
      <p className="text-sm text-ink-faint mb-6">You&apos;ll be the first Org Admin — invite your team afterward.</p>

      {register.isError && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3.5 py-3 mb-4">
          <AlertCircle className="h-4 w-4 text-danger flex-shrink-0" />
          <span className="text-sm text-danger">{register.error instanceof ApiError ? register.error.message : "Something went wrong."}</span>
        </div>
      )}

      <div className="mb-3.5">
        <Label className="mb-1.5 block">Organization name</Label>
        <div className="relative"><Building2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" placeholder="Solara Industries" value={orgName} onChange={(e) => setOrgName(e.target.value)} autoFocus /></div>
        {errors.orgName && <p className="mt-1 text-xs text-danger">{errors.orgName}</p>}
      </div>
      <div className="mb-3.5">
        <Label className="mb-1.5 block">Your name</Label>
        <Input placeholder="Rios Sharma" value={name} onChange={(e) => setName(e.target.value)} />
        {errors.name && <p className="mt-1 text-xs text-danger">{errors.name}</p>}
      </div>
      <div className="mb-3.5">
        <Label className="mb-1.5 block">Work email</Label>
        <div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" type="email" placeholder="you@solara.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        {errors.email && <p className="mt-1 text-xs text-danger">{errors.email}</p>}
      </div>
      <div className="mb-6">
        <Label className="mb-1.5 block">Password</Label>
        <div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {errors.password && <p className="mt-1 text-xs text-danger">{errors.password}</p>}
      </div>

      <Button type="submit" className="w-full h-12" disabled={register.isPending}>
        {register.isPending ? "Creating…" : "Create organization"}
      </Button>

      <div className="flex items-center gap-3 my-5">
        <div className="h-px flex-1 bg-line-soft" /><span className="text-xs text-ink-faint">or</span><div className="h-px flex-1 bg-line-soft" />
      </div>
      {/* Google still needs an org name — there's no Google field it
       * could come from — so the button is disabled-looking (greyed via
       * pointer-events) until one's typed above; the component itself
       * also re-checks this and shows an inline error if clicked early. */}
      <div className={!orgName.trim() ? "pointer-events-none opacity-50" : ""}>
        <GoogleSignInButton mode="register" orgName={orgName} />
      </div>
      {!orgName.trim() && (
        <p className="mt-1.5 text-center text-[11px] text-ink-faint">Enter your organization name above to continue with Google.</p>
      )}
    </form>
  );
}

function UserRegisterForm() {
  const [orgSlug, setOrgSlug] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Field order below matches what's actually asked for on the form —
  // phone, location, city, country, then this org's own custom fields
  // (if any), then password last. Job title/companyname/bio/timezone
  // were dropped entirely (see UserRegisterRequest's docstring for why)
  // rather than hidden behind a toggle — every field here is shown at
  // once, same visual weight, no "optional" styling.
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [password, setPassword] = useState("");
  // This org's own custom fields (set by its admin, e.g. a required
  // "Pincode") — keyed by shortname, only known once the org slug
  // resolves, see useLookupOrg.
  const [customValues, setCustomValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const lookup = useLookupOrg(orgSlug.trim());
  const { data: platformStatus } = usePlatformStatus();
  const registerUser = useRegisterUser();
  const profileFields = lookup.data?.profile_fields ?? [];
  const requiredFields = profileFields.filter((f) => f.required);
  const countries = platformStatus?.countries ?? [];

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const e2: Record<string, string> = {};
    if (!orgSlug.trim()) e2.orgSlug = "Organisation code is required";
    else if (lookup.isError) e2.orgSlug = "That organisation code wasn't found";
    if (!name.trim()) e2.name = "Your name is required";
    if (!/\S+@\S+\.\S+/.test(email)) e2.email = "Enter a valid email address";
    const missingField = requiredFields.find((f) => !(customValues[f.shortname] ?? "").trim());
    if (missingField) e2.customFields = `"${missingField.name}" is required by this organisation`;
    if (password.length < 8) e2.password = "At least 8 characters";
    setErrors(e2);
    if (Object.keys(e2).length) return;
    registerUser.mutate({
      org_slug: orgSlug.trim(), name, email,
      phone: phone || undefined, location: location || undefined,
      city: city || undefined, country: country || undefined,
      custom_fields: customValues, password,
    });
  };

  if (registerUser.isSuccess) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-line bg-surface px-6 py-10 text-center">
        <CheckCircle2 className="h-9 w-9 text-success" />
        <h2 className="font-head text-lg text-ink">Registration submitted</h2>
        <p className="text-sm text-ink-faint">
          An organisation admin needs to approve your account before you can log in. You&apos;ll be able to sign in
          as soon as that happens.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <h2 className="font-head text-2xl text-ink mb-1.5">Join an organisation</h2>
      <p className="text-sm text-ink-faint mb-6">Ask your organisation&apos;s admin for its code, then fill in your details.</p>

      {registerUser.isError && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3.5 py-3 mb-4">
          <AlertCircle className="h-4 w-4 text-danger flex-shrink-0" />
          <span className="text-sm text-danger">{registerUser.error instanceof ApiError ? registerUser.error.message : "Something went wrong."}</span>
        </div>
      )}

      <div className="mb-3.5">
        <Label className="mb-1.5 block">Organisation code <span className="text-danger">*</span></Label>
        <div className="relative"><Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" placeholder="solara-industries" value={orgSlug} onChange={(e) => setOrgSlug(e.target.value)} autoFocus /></div>
        {errors.orgSlug && <p className="mt-1 text-xs text-danger">{errors.orgSlug}</p>}
        {!errors.orgSlug && orgSlug.trim().length > 1 && (
          lookup.isLoading ? (
            <p className="mt-1 text-xs text-ink-faint">Checking…</p>
          ) : lookup.isError ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-danger"><XCircle className="h-3 w-3" /> Organisation not found</p>
          ) : lookup.data ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-success"><CheckCircle2 className="h-3 w-3" /> Joining {lookup.data.name}</p>
          ) : null
        )}
      </div>
      <div className="mb-3.5">
        <Label className="mb-1.5 block">Your name <span className="text-danger">*</span></Label>
        <div className="relative"><UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" placeholder="Rios Sharma" value={name} onChange={(e) => setName(e.target.value)} /></div>
        {errors.name && <p className="mt-1 text-xs text-danger">{errors.name}</p>}
      </div>
      <div className="mb-3.5">
        <Label className="mb-1.5 block">Email <span className="text-danger">*</span></Label>
        <div className="relative"><Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        {errors.email && <p className="mt-1 text-xs text-danger">{errors.email}</p>}
      </div>
      <div className="mb-3.5">
        <Label className="mb-1.5 block">Phone</Label>
        <Input placeholder="+91 98765 43210" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="mb-3.5">
        <Label className="mb-1.5 block">Location</Label>
        <Input placeholder="e.g. Head Office, Sector 5" value={location} onChange={(e) => setLocation(e.target.value)} />
      </div>
      <div className="mb-3.5">
        <Label className="mb-1.5 block">City</Label>
        <Input placeholder="e.g. Bengaluru" value={city} onChange={(e) => setCity(e.target.value)} />
      </div>
      <div className="mb-3.5">
        <Label className="mb-1.5 block">Country</Label>
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus-visible:border-primary"
        >
          <option value="">Select a country</option>
          {countries.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* This organisation's own required/optional fields (set by its
       * admin) — only shows up once the code above resolves to a real
       * org, same fields the admin's own "Invite a user" dialog has.
       * Comes right before Password, per where this org wants them. */}
      {profileFields.length > 0 && profileFields.map((f) => (
        <div key={f.id} className="mb-3.5">
          <Label className="mb-1.5 block">{f.name} {f.required && <span className="text-danger">*</span>}</Label>
          <CustomFieldInput
            field={f}
            value={customValues[f.shortname] ?? ""}
            onChange={(v) => setCustomValues((prev) => ({ ...prev, [f.shortname]: v }))}
          />
        </div>
      ))}
      {errors.customFields && <p className="mb-3.5 -mt-2 text-xs text-danger">{errors.customFields}</p>}

      <div className="mb-6">
        <Label className="mb-1.5 block">Password <span className="text-danger">*</span></Label>
        <div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" type="password" placeholder="At least 8 characters" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        {errors.password && <p className="mt-1 text-xs text-danger">{errors.password}</p>}
      </div>

      <Button type="submit" className="w-full h-12" disabled={registerUser.isPending}>
        {registerUser.isPending ? "Submitting…" : "Register"}
      </Button>
    </form>
  );
}

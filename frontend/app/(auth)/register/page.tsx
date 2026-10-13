"use client";
import { useState } from "react";
import Link from "next/link";
import { Building2, Mail, Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegister } from "@/lib/hooks/use-auth";
import { ApiError } from "@/lib/api-client";

export default function RegisterPage() {
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
    <div className="flex h-screen items-center justify-center bg-paper p-8">
      <form onSubmit={submit} className="w-full max-w-[380px]">
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
        <div className="flex items-center justify-center gap-1.5 pt-6">
          <span className="text-xs text-ink-faint">Already have an account?</span>
          <Link href="/login" className="text-xs font-semibold text-primary">Log in</Link>
        </div>
      </form>
    </div>
  );
}

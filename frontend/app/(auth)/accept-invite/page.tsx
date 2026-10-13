"use client";
import { useState, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Lock, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";

function AcceptInviteForm() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 8) return setError("At least 8 characters");
    if (password !== confirm) return setError("Passwords don't match");
    setLoading(true);
    try {
      await api.post("/api/v1/users/accept-invite", { token, password });
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "This invite link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="w-full max-w-[380px]">
      <h2 className="font-head text-2xl text-ink mb-1.5">Set your password</h2>
      <p className="text-sm text-ink-faint mb-6">You&apos;ve been invited to join Riosmart LMS.</p>

      {!token && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-soft px-3.5 py-3 mb-4">
          <AlertCircle className="h-4 w-4 text-amber flex-shrink-0" />
          <span className="text-sm text-ink">This link is missing its invite token.</span>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3.5 py-3 mb-4">
          <AlertCircle className="h-4 w-4 text-danger flex-shrink-0" />
          <span className="text-sm text-danger">{error}</span>
        </div>
      )}

      <div className="mb-3.5">
        <Label className="mb-1.5 block">Password</Label>
        <div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></div>
      </div>
      <div className="mb-6">
        <Label className="mb-1.5 block">Confirm password</Label>
        <div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
          <Input className="pl-9" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
      </div>

      <Button type="submit" className="w-full h-12" disabled={loading || !token}>
        {loading ? "Setting up your account…" : "Accept invite & log in"}
      </Button>
    </form>
  );
}

export default function AcceptInvitePage() {
  return (
    <div className="flex h-screen items-center justify-center bg-paper p-8">
      <Suspense fallback={null}>
        <AcceptInviteForm />
      </Suspense>
    </div>
  );
}

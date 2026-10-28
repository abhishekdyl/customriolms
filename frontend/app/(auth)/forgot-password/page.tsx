"use client";
import { useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, Mail, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useForgotPassword } from "@/lib/hooks/use-auth";
import { ApiError } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const forgotPassword = useForgotPassword();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/\S+@\S+\.\S+/.test(email)) {
      setFieldError("Enter a valid email address");
      return;
    }
    setFieldError(null);
    forgotPassword.mutate(email);
  };

  if (forgotPassword.isSuccess) {
    return (
      <div className="flex h-screen items-center justify-center bg-paper p-8">
        <div className="w-full max-w-[380px] text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-success-soft">
            <MailCheck className="h-5 w-5 text-success" />
          </div>
          <h2 className="font-head text-xl text-ink mb-2">Check your email</h2>
          <p className="text-sm text-ink-faint mb-6">
            If an account exists for <span className="text-ink">{email}</span>, we&apos;ve sent a link to reset your
            password. It expires in 30 minutes.
          </p>
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary">
            <ArrowLeft className="h-4 w-4" /> Back to log in
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-paper p-8">
      <form onSubmit={submit} className="w-full max-w-[380px]">
        <h2 className="font-head text-2xl text-ink mb-1.5">Forgot your password?</h2>
        <p className="text-sm text-ink-faint mb-6">Enter your work email and we&apos;ll send you a reset link.</p>

        {forgotPassword.isError && (
          <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3.5 py-3 mb-4">
            <AlertCircle className="h-4 w-4 text-danger flex-shrink-0" />
            <span className="text-sm text-danger">
              {forgotPassword.error instanceof ApiError ? forgotPassword.error.message : "Something went wrong — try again."}
            </span>
          </div>
        )}

        <div className="mb-6">
          <Label htmlFor="email" className="mb-1.5 block">Work email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input
              id="email" type="email" placeholder="you@solara.com" className="pl-9" autoFocus
              value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {fieldError && <p className="mt-1 text-xs text-danger">{fieldError}</p>}
        </div>

        <Button type="submit" className="w-full h-12" disabled={forgotPassword.isPending}>
          {forgotPassword.isPending ? "Sending…" : "Send reset link"}
        </Button>

        <div className="flex items-center justify-center gap-1.5 pt-6">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary">
            <ArrowLeft className="h-3.5 w-3.5" /> Back to log in
          </Link>
        </div>
      </form>
    </div>
  );
}

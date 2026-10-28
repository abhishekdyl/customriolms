"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, AlertCircle, Building2, Check, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLogin } from "@/lib/hooks/use-auth";
import { ApiError } from "@/lib/api-client";
import { GoogleSignInButton } from "@/components/shell/auth/google-sign-in-button";

/** Shown after a password reset — isolated in its own component because
 * useSearchParams needs a Suspense boundary, and there's no reason to
 * make the whole form wait on that. */
function ResetSuccessBanner() {
  const params = useSearchParams();
  if (params.get("reset") !== "1") return null;
  return (
    <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3.5 py-3 mb-4">
      <CheckCircle2 className="h-4 w-4 text-success flex-shrink-0" />
      <span className="text-sm text-ink">Your password has been reset — log in with your new one.</span>
    </div>
  );
}

/**
 * Ported from LoginScreen in the lms_screens.jsx mockup — same split-panel
 * layout, same copy. The mockup's org-detection / OTP flow (email domain
 * → Password vs OTP) isn't wired here: that logic lives entirely client-side
 * in the mockup and has no backend endpoint yet (login_method isn't a real
 * field on the Org model). Ship plain email+password first; add the
 * detection step once /auth/login-method or equivalent exists.
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const login = useLogin();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const errors: typeof fieldErrors = {};
    if (!email) errors.email = "Email is required";
    else if (!/\S+@\S+\.\S+/.test(email)) errors.email = "Enter a valid email address";
    if (!password) errors.password = "Password is required";
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;
    login.mutate({ email, password });
  };

  return (
    <div className="flex h-screen bg-paper">
      <div className="hidden md:flex w-[440px] flex-col justify-between p-10 text-white bg-gradient-to-br from-rail to-[#241B5C]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-[30px] w-[30px] items-center justify-center rounded-lg bg-primary font-head font-bold">S</div>
          <span className="font-head text-lg">Riosmart LMS</span>
        </div>
        <div>
          <h1 className="font-head text-2xl leading-snug mb-6">
            Training built around how your team actually works.
          </h1>
          {["AI-generated content and quizzes", "Real-time team performance insights", "Enterprise-grade access controls"].map((f) => (
            <div key={f} className="flex items-center gap-2.5 mb-3">
              <div className="flex h-5 w-5 items-center justify-center rounded-full bg-white/10 flex-shrink-0">
                <Check className="h-2.5 w-2.5" />
              </div>
              <span className="text-sm text-white/75">{f}</span>
            </div>
          ))}
        </div>
        <span className="text-xs text-white/40">© 2026 Solara Industries</span>
      </div>

      <div className="flex flex-1 items-center justify-center overflow-auto p-8">
        <motion.form
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          onSubmit={submit}
          className="w-full max-w-[380px]"
        >
          <h2 className="font-head text-2xl text-ink mb-1.5">Log in</h2>
          <p className="text-sm text-ink-faint mb-6">Welcome back — enter your work email to continue.</p>

          <Suspense fallback={null}>
            <ResetSuccessBanner />
          </Suspense>

          {login.isError && (
            <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3.5 py-3 mb-4">
              <AlertCircle className="h-4 w-4 text-danger flex-shrink-0" />
              <span className="text-sm text-danger">
                {login.error instanceof ApiError ? login.error.message : "Something went wrong — try again."}
              </span>
            </div>
          )}

          <div className="mb-3.5">
            <Label htmlFor="email" className="mb-1.5 block">Work email</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input id="email" type="email" placeholder="you@solara.com" className="pl-9" autoFocus
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            {fieldErrors.email && <p className="mt-1 text-xs text-danger">{fieldErrors.email}</p>}
          </div>

          <div className="mb-1">
            <Label htmlFor="password" className="mb-1.5 block">Password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
              <Input id="password" type={showPw ? "text" : "password"} placeholder="Enter your password" className="pl-9 pr-9"
                value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {fieldErrors.password && <p className="mt-1 text-xs text-danger">{fieldErrors.password}</p>}
          </div>

          <div className="flex justify-end mt-2 mb-6">
            <Link href="/forgot-password" className="text-xs font-medium text-primary">Forgot password?</Link>
          </div>

          <Button type="submit" className="w-full h-12" disabled={login.isPending}>
            {login.isPending ? "Logging in…" : "Log in"}
          </Button>

          <div className="flex items-center gap-3 my-5">
            <div className="h-px flex-1 bg-line-soft" /><span className="text-xs text-ink-faint">or</span><div className="h-px flex-1 bg-line-soft" />
          </div>
          <GoogleSignInButton mode="login" />

          <div className="flex items-center justify-center gap-1.5 pt-6">
            <span className="text-xs text-ink-faint">New org?</span>
            <Link href="/register" className="text-xs font-semibold text-primary">Create an account</Link>
          </div>
        </motion.form>
      </div>
    </div>
  );
}

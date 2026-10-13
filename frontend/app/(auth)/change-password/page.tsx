"use client";
import { useState } from "react";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, AlertCircle, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChangePassword } from "@/lib/hooks/use-auth";
import { ApiError } from "@/lib/api-client";

/**
 * Forced first step for every admin-created account: they start on the
 * shared default password (see invite_service.DEFAULT_PASSWORD on the
 * backend), and useLogin() sends them straight here instead of the
 * dashboard when the login response says must_change_password.
 */
export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const changePassword = useChangePassword();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      setFieldError("New password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setFieldError("New passwords don't match.");
      return;
    }
    setFieldError(null);
    changePassword.mutate({ current_password: currentPassword, new_password: newPassword });
  };

  return (
    <div className="flex h-screen items-center justify-center bg-paper p-8">
      <motion.form
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2 }}
        onSubmit={submit}
        className="w-full max-w-[380px]"
      >
        <div className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl bg-amber-soft">
          <ShieldAlert className="h-5 w-5 text-amber" />
        </div>
        <h2 className="font-head text-2xl text-ink mb-1.5">Set a new password</h2>
        <p className="text-sm text-ink-faint mb-6">
          Your account was created with a temporary password. Set one only you know before continuing.
        </p>

        {(changePassword.isError || fieldError) && (
          <div className="flex items-center gap-2 rounded-lg bg-danger-soft px-3.5 py-3 mb-4">
            <AlertCircle className="h-4 w-4 text-danger flex-shrink-0" />
            <span className="text-sm text-danger">
              {fieldError || (changePassword.error instanceof ApiError ? changePassword.error.message : "Something went wrong — try again.")}
            </span>
          </div>
        )}

        <div className="mb-3.5">
          <Label className="mb-1.5 block">Temporary / current password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input type={showPw ? "text" : "password"} className="pl-9" autoFocus
              value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>
        </div>

        <div className="mb-3.5">
          <Label className="mb-1.5 block">New password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input type={showPw ? "text" : "password"} className="pl-9 pr-9" minLength={8}
              value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div className="mb-6">
          <Label className="mb-1.5 block">Confirm new password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" />
            <Input type={showPw ? "text" : "password"} className="pl-9" minLength={8}
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>
        </div>

        <Button type="submit" className="w-full h-12" disabled={changePassword.isPending}>
          {changePassword.isPending ? "Saving…" : "Set new password"}
        </Button>
      </motion.form>
    </div>
  );
}

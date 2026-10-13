import { AlertCircle } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <div className="flex h-screen items-center justify-center bg-paper p-8">
      <div className="w-full max-w-[380px] text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-amber-soft">
          <AlertCircle className="h-5 w-5 text-amber" />
        </div>
        <h2 className="font-head text-xl text-ink mb-2">Not wired up yet</h2>
        <p className="text-sm text-ink-faint">
          There&apos;s no password-reset endpoint on the backend yet (no reset-token table, no email send).
          The design exists as ForgotPasswordScreen in lms_screens.jsx, ready to connect once that exists.
        </p>
      </div>
    </div>
  );
}

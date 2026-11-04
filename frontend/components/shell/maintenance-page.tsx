"use client";
import { Wrench } from "lucide-react";
import { useLogout } from "@/lib/hooks/use-auth";

/** Shown instead of the real page to anyone who isn't Super Admin while
 * PlatformSettings.maintenance_mode is on (see AuthGuard). Super Admin
 * never sees this — they keep working the whole time, which is also how
 * they turn it back off from Platform Settings ▸ System. */
export function MaintenancePage() {
  const logout = useLogout();
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-soft">
        <Wrench className="h-6 w-6 text-amber" />
      </div>
      <h1 className="font-head text-xl text-ink">We&apos;ll be right back</h1>
      <p className="max-w-[420px] text-sm text-ink-faint">
        Riosmart LMS is currently undergoing scheduled maintenance. Please check back in a few minutes — nothing you
        were working on has been lost.
      </p>
      <button onClick={logout} className="mt-2 text-xs font-medium text-primary">
        Log out
      </button>
    </div>
  );
}

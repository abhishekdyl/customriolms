"use client";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { useReturnToAdmin } from "@/lib/hooks/use-auth";

/** A thin strip across the very top of every page while an Org Admin is
 * "logged in as" someone else (see users.py's login_as_user and
 * useLoginAs). Mounted once in the root layout, outside any particular
 * dashboard/learner shell, so it follows the admin through whichever
 * area the impersonated role lands them in.
 *
 * Reads localStorage only after mount (useEffect) to avoid a
 * server/client render mismatch — this box is irrelevant to anyone who
 * isn't mid-impersonation, so rendering nothing until then is fine. */
export function ImpersonationBanner() {
  const [impersonating, setImpersonating] = useState(false);
  const { data: user } = useCurrentUser();
  const returnToAdmin = useReturnToAdmin();

  useEffect(() => {
    setImpersonating(!!localStorage.getItem("impersonator_access_token"));
  }, []);

  if (!impersonating) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-ink px-4 py-2 text-xs text-white">
      <span>
        Viewing as <strong>{user?.full_name ?? "…"}</strong>
        {user ? ` (${user.role.replace("_", " ")})` : ""}
      </span>
      <button
        onClick={returnToAdmin}
        className="rounded-md bg-white/15 px-2.5 py-1 text-[11px] font-medium hover:bg-white/25"
      >
        Return to admin
      </button>
    </div>
  );
}

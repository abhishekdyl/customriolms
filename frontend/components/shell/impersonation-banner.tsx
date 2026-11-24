"use client";
import { useEffect, useState } from "react";
import { useCurrentUser } from "@/lib/hooks/use-auth";

/** A thin strip across the very top of every page while an Org Admin is
 * "logged in as" someone else (see users.py's login_as_user and
 * useLoginAs). Mounted once in the root layout, outside any particular
 * dashboard/learner shell, so it follows the admin through whichever
 * area the impersonated role lands them in.
 *
 * Purely informational — there's no "Return to admin" button here on
 * purpose. Logging in as someone else replaces the admin's own session
 * outright (see useLoginAs's docstring), so ending it is just the
 * normal Logout button every session already has, followed by logging
 * back in with the admin's own credentials. This banner only exists so
 * the admin never mistakes the account they're viewing for their own.
 *
 * Reads localStorage only after mount (useEffect) to avoid a
 * server/client render mismatch — this box is irrelevant to anyone who
 * isn't mid-impersonation, so rendering nothing until then is fine. */
export function ImpersonationBanner() {
  const [viewingAs, setViewingAs] = useState(false);
  const { data: user } = useCurrentUser();

  useEffect(() => {
    setViewingAs(localStorage.getItem("viewing_as") === "1");
  }, []);

  if (!viewingAs) return null;

  return (
    <div className="flex items-center justify-center gap-3 bg-ink px-4 py-2 text-xs text-white">
      <span>
        Viewing as <strong>{user?.full_name ?? "…"}</strong>
        {user ? ` (${user.role.replace("_", " ")})` : ""} — log out to leave this account.
      </span>
    </div>
  );
}

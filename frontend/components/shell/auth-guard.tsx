"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { ROLE_HOME } from "@/lib/role-home";
import type { RoleName } from "@/lib/types";

/**
 * Stops someone from just typing /teams or /learn into the address bar
 * without logging in — or from getting past /change-password by hitting
 * back/forward or a stale tab.
 *
 * With `allowedRoles`, it also keeps each role inside its own area: a
 * learner who opens /users is sent to /learn, an Org Admin who opens
 * /learn is sent to /dashboard, and so on.
 *
 * This is a UX guard only — the real enforcement is server-side (every
 * API call needs a valid session token, and require_role() checks the
 * role). This just avoids flashing a page the user shouldn't see.
 */
export function AuthGuard({
  children,
  allowedRoles,
}: {
  children: React.ReactNode;
  allowedRoles?: RoleName[];
}) {
  const router = useRouter();
  const [hasToken, setHasToken] = useState(false);
  const { data: user, isError } = useCurrentUser();

  useEffect(() => {
    const token = localStorage.getItem("access_token");
    if (!token) {
      router.replace("/login");
      return;
    }
    setHasToken(true);
  }, [router]);

  useEffect(() => {
    if (user?.must_change_password) {
      router.replace("/change-password");
    }
  }, [user, router]);

  const wrongRole = !!user && !!allowedRoles && !allowedRoles.includes(user.role);

  useEffect(() => {
    if (wrongRole && user) router.replace(ROLE_HOME[user.role]);
  }, [wrongRole, user, router]);

  if (!hasToken || isError) return null;
  if (user?.must_change_password) return null;
  // When roles are restricted, wait until we actually know the role
  // (and render nothing while redirecting a wrong-role visitor).
  if (allowedRoles && (!user || wrongRole)) return null;
  return <>{children}</>;
}

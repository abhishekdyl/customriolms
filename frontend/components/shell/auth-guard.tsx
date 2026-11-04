"use client";
import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { useMyCustomFields } from "@/lib/hooks/use-profile-fields";
import { ROLE_HOME } from "@/lib/role-home";
import type { RoleName } from "@/lib/types";

/** Where a role fills in its own org-required custom profile fields — a
 * learner already has a profile page under /learn; every other role gets
 * the new self-service one at /profile (see app/(dashboard)/profile). */
function completeProfilePath(role: RoleName): string {
  return role === "learner" ? "/learn/profile" : "/profile";
}

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
  const pathname = usePathname();
  const [hasToken, setHasToken] = useState(false);
  const { data: user, isError } = useCurrentUser();
  // Only actually needed once a password-change isn't already pending —
  // see the enabled flag below — so this never fires an extra request
  // for someone who's about to be bounced to /change-password anyway.
  const { data: customFields } = useMyCustomFields({ enabled: !!user && !user.must_change_password });

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

  // An Org Admin can mark a custom profile field mandatory — same idea as
  // must_change_password: a required field with no value yet blocks
  // everything else until it's filled, except the page that lets them
  // fill it (hence the pathname check, so this doesn't just redirect to
  // itself forever once they're actually there).
  const missingRequiredField = !!user && !user.must_change_password && !!customFields?.some(
    (f) => f.required && !(f.value ?? "").trim()
  );
  const profilePath = user ? completeProfilePath(user.role) : null;

  useEffect(() => {
    if (missingRequiredField && profilePath && pathname !== profilePath) {
      router.replace(profilePath);
    }
  }, [missingRequiredField, profilePath, pathname, router]);

  if (!hasToken || isError) return null;
  if (user?.must_change_password) return null;
  // When roles are restricted, wait until we actually know the role
  // (and render nothing while redirecting a wrong-role visitor).
  if (allowedRoles && (!user || wrongRole)) return null;
  if (missingRequiredField && pathname !== profilePath) return null;
  return <>{children}</>;
}

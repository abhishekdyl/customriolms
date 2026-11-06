"use client";
import { useEffect, useState } from "react";
import { usePathname, useParams, useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { useMyCustomFields } from "@/lib/hooks/use-profile-fields";
import { usePlatformStatus } from "@/lib/hooks/use-orgs";
import { MaintenancePage } from "@/components/shell/maintenance-page";
import { TrialEndedPage } from "@/components/shell/trial-ended-page";
import { profilePath, roleHome } from "@/lib/role-home";
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
  const pathname = usePathname();
  // Present only for pages under app/[org]/... (the dashboard/learner
  // shells) — absent for org-less pages like /organizations or the
  // unprefixed /profile, which never run this check.
  const params = useParams<{ org?: string }>();
  const [hasToken, setHasToken] = useState(false);
  const { data: user, isError } = useCurrentUser();
  // Public, unauthenticated — independent of whether /auth/me itself
  // succeeded, since during maintenance it 503s for everyone except
  // Super Admin (see deps._validate_token). This is what tells apart a
  // genuine auth failure (isError, show nothing, let the token check
  // below bounce to /login) from "the whole platform is paused right
  // now" (show the maintenance page instead).
  const { data: platformStatus } = usePlatformStatus();
  const inMaintenance = !!platformStatus?.maintenance_mode && user?.role !== "super_admin";
  // /auth/me uses the trial-suspension-lenient dependency (unlike
  // maintenance, which 503s it outright) specifically so this can read
  // the org's own status — see deps.get_current_user_allow_trial_suspended.
  // A manually-suspended org still 403s /auth/me (isError below), same as
  // always; only trial_expired reaches this far.
  const trialEnded = user?.org_status === "suspended" && user?.org_suspension_reason === "trial_expired";
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
    if (wrongRole && user) router.replace(roleHome(user.role, user.org_slug));
  }, [wrongRole, user, router]);

  // Someone editing the URL's org segment by hand (typing another org's
  // slug, or a stale link from before they were moved to a new org)
  // lands here with params.org not matching their own — this is a UX
  // nicety only (every API call is still scoped server-side by the
  // token's own org_id, never by this URL segment), but it keeps the
  // address bar honest rather than silently showing their real org's
  // data under someone else's slug. Super Admin has no org_slug of
  // their own and never opens an [org] page (allowedRoles below keeps
  // them out), so this never fires for them.
  const wrongOrg = !!user && !wrongRole && !!params.org && !!user.org_slug && params.org !== user.org_slug;

  useEffect(() => {
    if (wrongOrg && user.org_slug && params.org) {
      router.replace(pathname.replace(`/${params.org}`, `/${user.org_slug}`));
    }
  }, [wrongOrg, user, params.org, pathname, router]);

  // An Org Admin can mark a custom profile field mandatory — same idea as
  // must_change_password: a required field with no value yet blocks
  // everything else until it's filled, except the page that lets them
  // fill it (hence the pathname check, so this doesn't just redirect to
  // itself forever once they're actually there).
  const missingRequiredField = !!user && !user.must_change_password && !!customFields?.some(
    (f) => f.required && !(f.value ?? "").trim()
  );
  const ownProfilePath = user ? profilePath(user.role, user.org_slug) : null;

  useEffect(() => {
    if (missingRequiredField && ownProfilePath && pathname !== ownProfilePath) {
      router.replace(ownProfilePath);
    }
  }, [missingRequiredField, ownProfilePath, pathname, router]);

  if (!hasToken) return null;
  if (inMaintenance) return <MaintenancePage />;
  if (trialEnded) return <TrialEndedPage />;
  if (isError) return null;
  if (user?.must_change_password) return null;
  // When roles are restricted, wait until we actually know the role
  // (and render nothing while redirecting a wrong-role visitor).
  if (allowedRoles && (!user || wrongRole)) return null;
  if (wrongOrg) return null;
  if (missingRequiredField && pathname !== ownProfilePath) return null;
  return <>{children}</>;
}

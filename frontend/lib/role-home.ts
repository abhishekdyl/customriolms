import type { RoleName } from "@/lib/types";

/**
 * Where each role lands after login (and where AuthGuard sends someone
 * who opens a page that isn't theirs). Every org-scoped role's pages live
 * under their own org's URL prefix (e.g. /tech-learning/dashboard,
 * /tech-learning/learn) — see the [org] route segment. Super Admin is the
 * one exception: they aren't a member of any customer org, so their home
 * has no prefix at all.
 *
 * `orgSlug` should come from the same place the role did (the login
 * response, or the cached /auth/me user) — never guessed or read back out
 * of the current URL.
 */
export function roleHome(role: RoleName, orgSlug?: string | null): string {
  if (role === "super_admin") return "/organizations";
  const base = role === "learner" ? "/learn" : "/dashboard";
  return orgSlug ? `/${orgSlug}${base}` : base;
}

/** Where a role fills in its own org-required custom profile fields, and
 * where the sidebar's own "your profile" link points. A learner already
 * has a fuller profile page under .../learn/profile; every other
 * org-scoped role gets the self-service one at .../profile (see
 * app/[org]/(dashboard)/profile); Super Admin's is unprefixed. */
export function profilePath(role: RoleName, orgSlug?: string | null): string {
  if (role === "super_admin") return "/profile";
  if (role === "learner") return orgSlug ? `/${orgSlug}/learn/profile` : "/learn/profile";
  return orgSlug ? `/${orgSlug}/profile` : "/profile";
}

import type { RoleName } from "@/lib/types";

/**
 * Where each role lands after login (and where AuthGuard sends someone who
 * opens a page that isn't theirs). One map, so a role's home is never
 * hard-coded in more than one place.
 */
export const ROLE_HOME: Record<RoleName, string> = {
  super_admin: "/organizations",
  org_admin: "/dashboard",
  team_lead: "/dashboard",
  learner: "/learn",
  // A custom role is always some slice of what Org Admin can see, so it
  // lands on the same dashboard — the sidebar then only shows the nav
  // items their capabilities actually unlock (see navItemsFor in
  // components/shell/sidebar.tsx).
  custom: "/dashboard",
};

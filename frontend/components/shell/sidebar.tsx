"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Users, BookOpen, ShieldCheck, Sparkles, Bell, Building2, LayoutDashboard, Server, LogOut, Library, History, BarChart3, KeyRound, Rocket } from "lucide-react";
import { useCurrentUser, useLogout } from "@/lib/hooks/use-auth";
import { useMyOrg } from "@/lib/hooks/use-orgs";
import { cn } from "@/lib/utils";
import type { RoleName } from "@/lib/types";

type NavItem = { href: string; label: string; icon: typeof Users; capability?: string | string[] };

// Mirrors navByRole in the approved lms_screens.jsx prototype exactly:
// each role gets its OWN nav, not a filtered subset of one big list.
// Super Admin in particular does NOT see Teams/Courses/Users — those
// are a customer org's own screens, not the platform's. `capability`
// is only used for the "custom" role below — see navItemsFor — and is
// ignored for every built-in role (they're fixed, per the user's own
// call: built-in roles' nav/behavior never changes).
const navByRole: Record<RoleName, NavItem[]> = {
  super_admin: [
    { href: "/organizations", label: "Organizations", icon: Building2 },
    { href: "/pilots", label: "Pilots", icon: Rocket },
    { href: "/platform-settings", label: "Platform Settings", icon: Server },
  ],
  org_admin: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/teams", label: "Teams", icon: Users, capability: "teams.view" },
    { href: "/courses", label: "Courses", icon: BookOpen, capability: "courses.view" },
    { href: "/question-banks", label: "Question Banks", icon: Library, capability: "question_banks.manage" },
    { href: "/users", label: "Users & Access", icon: ShieldCheck, capability: "users.view" },
    { href: "/recognition", label: "Recognition", icon: Sparkles, capability: ["badges.view", "skills.view", "certificates.view"] },
    { href: "/reports", label: "Reports", icon: BarChart3, capability: "reports.view" },
    { href: "/notifications", label: "Notifications", icon: Bell, capability: "notifications.manage" },
    { href: "/audit-log", label: "Audit Log", icon: History, capability: "audit_log.view" },
    { href: "/roles", label: "Roles", icon: KeyRound }, // ORG_ADMIN-only, never shown to custom roles
    { href: "/settings", label: "Org Settings", icon: Building2, capability: "org_settings.manage" },
  ],
  team_lead: [
    { href: "/dashboard", label: "My Team", icon: Users },
    { href: "/courses", label: "Courses", icon: BookOpen },
    { href: "/reports", label: "Reports", icon: BarChart3 },
  ],
  // Dead weight, kept only so the Record<RoleName, ...> type stays
  // total: a learner never reaches this [org]/(dashboard) layout at all —
  // its own AuthGuard only allows org_admin/team_lead/custom, and
  // bounces a learner to roleHome() ("/{org}/learn") before this nav
  // ever renders. The learner's REAL nav (Home/My Courses/Calendar/
  // Progress/Profile) lives in components/learner/learner-nav.tsx.
  learner: [],
  // A custom role's nav is org_admin's list filtered down to whatever
  // its capabilities actually unlock — see navItemsFor. This array is
  // never read directly for "custom" (navItemsFor special-cases it),
  // kept empty only so the Record<RoleName, ...> type stays total.
  custom: [],
};

/** org_admin's nav, filtered to what `capabilities` actually grants.
 * `capabilities === null` means "every capability" (shouldn't happen
 * for a custom-role user, but treated as "show everything" just in
 * case rather than hiding the whole sidebar). "Roles" is excluded
 * outright — defining roles is ORG_ADMIN-only, never delegatable (see
 * the custom_roles router's privilege-escalation guard). */
function navItemsFor(role: RoleName, capabilities: string[] | null | undefined): NavItem[] {
  if (role !== "custom") return navByRole[role];
  return navByRole.org_admin.filter((item) => {
    if (item.href === "/roles") return false;
    if (!item.capability) return true;
    if (!capabilities) return true;
    const required = Array.isArray(item.capability) ? item.capability : [item.capability];
    return required.some((cap) => capabilities.includes(cap));
  });
}

export function Sidebar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const logout = useLogout();
  // Super Admin isn't a member of any customer org — they always see the
  // platform's own name. Every other role sees THEIR org's name here,
  // so if an Org Admin renames their org on the Settings page, every
  // user in that org sees the new name in the sidebar immediately
  // (useMyOrg's query gets invalidated by that save).
  const { data: myOrg } = useMyOrg(user?.role !== "super_admin");
  const brandName = user?.role === "super_admin" ? "Riosmart LMS" : myOrg?.name || "Riosmart LMS";

  // Every org-scoped role's nav lives under its own org slug (/tech-learning/users,
  // ...) — Super Admin's items (Organizations, Pilots, Platform Settings)
  // stay unprefixed, since they aren't a member of any customer org.
  const prefix = user && user.role !== "super_admin" && user.org_slug ? `/${user.org_slug}` : "";
  const items = user?.role ? navItemsFor(user.role, user.capabilities).map((item) => ({ ...item, href: `${prefix}${item.href}` })) : [];
  const profileHref = `${prefix}/profile`;

  return (
    <motion.div
      initial={{ x: -20, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{ duration: 0.2 }}
      className="flex h-full w-[232px] flex-shrink-0 flex-col bg-rail"
    >
      <div className="border-b border-white/10 px-5 pb-5 pt-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-primary font-head text-sm font-bold text-white">
            {brandName.charAt(0).toUpperCase()}
          </div>
          <span className="truncate font-head text-[15px] text-white">{brandName}</span>
        </div>
      </div>

      <nav className="flex-1 px-3 pt-4">
        {items.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "mb-1 flex items-center gap-3 rounded px-3 py-2.5 text-[13.5px]",
                active ? "bg-white/8 text-white border-l-2 border-amber" : "text-white/55 border-l-2 border-transparent"
              )}
            >
              <item.icon className="h-[17px] w-[17px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="flex items-center gap-2.5 border-t border-white/10 px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber font-head text-[11px] font-bold text-white">
          {user?.full_name?.split(" ").map((n) => n[0]).join("") || "…"}
        </div>
        <Link href={profileHref} className="min-w-0 flex-1" title="Your profile">
          <div className="truncate text-xs text-white">{user?.full_name || "Loading…"}</div>
          <div className="text-[11px] text-white/50">{user?.role?.replace("_", " ") || ""}</div>
        </Link>
        <button onClick={logout} title="Log out"><LogOut className="h-4 w-4 text-white/50" /></button>
      </div>
    </motion.div>
  );
}

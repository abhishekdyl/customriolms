"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { Users, BookOpen, ShieldCheck, Sparkles, Bell, Building2, LayoutDashboard, Server, LogOut } from "lucide-react";
import { useCurrentUser, useLogout } from "@/lib/hooks/use-auth";
import { useMyOrg } from "@/lib/hooks/use-orgs";
import { cn } from "@/lib/utils";
import type { RoleName } from "@/lib/types";

// Mirrors navByRole in the approved lms_screens.jsx prototype exactly:
// each role gets its OWN nav, not a filtered subset of one big list.
// Super Admin in particular does NOT see Teams/Courses/Users — those
// are a customer org's own screens, not the platform's.
const navByRole: Record<RoleName, { href: string; label: string; icon: typeof Users }[]> = {
  super_admin: [
    { href: "/organizations", label: "Organizations", icon: Building2 },
    { href: "/platform-settings", label: "Platform Settings", icon: Server },
  ],
  org_admin: [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/teams", label: "Teams", icon: Users },
    { href: "/courses", label: "Courses", icon: BookOpen },
    { href: "/users", label: "Users & Access", icon: ShieldCheck },
    { href: "/recognition", label: "Recognition", icon: Sparkles },
    { href: "/notifications", label: "Notifications", icon: Bell },
    { href: "/settings", label: "Org Settings", icon: Building2 },
  ],
  team_lead: [
    { href: "/dashboard", label: "My Team", icon: Users },
    { href: "/courses", label: "Courses", icon: BookOpen },
  ],
  learner: [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard },
    { href: "/courses", label: "My Courses", icon: BookOpen },
    { href: "/recognition", label: "Progress", icon: Sparkles },
  ],
};

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

  const items = user?.role ? navByRole[user.role] : [];

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
          {user?.name?.split(" ").map((n) => n[0]).join("") || "…"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-xs text-white">{user?.name || "Loading…"}</div>
          <div className="text-[11px] text-white/50">{user?.role?.replace("_", " ") || ""}</div>
        </div>
        <button onClick={logout} title="Log out"><LogOut className="h-4 w-4 text-white/50" /></button>
      </div>
    </motion.div>
  );
}

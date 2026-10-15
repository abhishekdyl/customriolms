"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Award, BookOpen, Home, LogOut, User as UserIcon } from "lucide-react";
import { useCurrentUser, useLogout } from "@/lib/hooks/use-auth";
import { useMyOrg } from "@/lib/hooks/use-orgs";
import { cn } from "@/lib/utils";

// Same four destinations as navByRole.learner in the prototype.
const NAV = [
  { href: "/learn", label: "Home", icon: Home },
  { href: "/learn/courses", label: "My Courses", icon: BookOpen },
  { href: "/learn/progress", label: "Progress", icon: Award },
  { href: "/learn/profile", label: "Profile", icon: UserIcon },
];

// "/learn" is a prefix of every other learner route, so Home must match exactly.
function isActive(pathname: string, href: string) {
  return href === "/learn" ? pathname === "/learn" : pathname.startsWith(href);
}

/** Desktop / tablet: dark left rail, collapses to icons below `lg`. */
export function LearnerSidebar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: myOrg } = useMyOrg(true);
  const logout = useLogout();
  const brandName = myOrg?.name || "Riosmart LMS";
  const initials = user?.full_name?.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase() || "…";

  return (
    <aside className="hidden h-full w-[72px] shrink-0 flex-col bg-rail md:flex lg:w-[232px]">
      <div className="flex justify-center border-b border-white/12 pb-5 pt-6 lg:justify-start lg:px-5">
        <div className="flex items-center gap-2">
          <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[7px] bg-primary font-head text-[13px] font-bold text-white">
            {brandName.charAt(0).toUpperCase()}
          </div>
          <span className="hidden truncate font-head text-[15px] font-medium text-white lg:block">{brandName}</span>
        </div>
      </div>

      <nav className="flex-1 px-2 py-4 lg:px-3">
        {NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "mb-1 flex w-full items-center justify-center gap-3 rounded border-l-2 py-3 lg:justify-start lg:px-3 lg:py-2.5",
                active ? "border-amber bg-white/10" : "border-transparent"
              )}
            >
              <item.icon className="h-[17px] w-[17px]" color={active ? "#fff" : "rgba(255,255,255,0.62)"} />
              <span
                className={cn(
                  "hidden text-[13.5px] lg:block",
                  active ? "font-medium text-white" : "text-white/60"
                )}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-2 border-t border-white/12 py-4 lg:items-stretch lg:px-5">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber font-head text-[11px] font-bold text-white">
            {initials}
          </div>
          <div className="hidden min-w-0 lg:block">
            <div className="truncate text-[12.5px] text-white">{user?.full_name || "Loading…"}</div>
            <div className="text-[11px] text-white/60">Learner</div>
          </div>
        </div>
        <button onClick={logout} title="Log out" className="flex items-center gap-2 active:opacity-70 lg:mt-1">
          <LogOut className="h-4 w-4 text-white/60 lg:hidden" />
          <span className="hidden text-[11.5px] text-white/60 lg:block">Log out</span>
        </button>
      </div>
    </aside>
  );
}

/** Phones: bottom tab bar instead of the rail. */
export function LearnerTabBar() {
  const pathname = usePathname();
  return (
    <nav className="flex shrink-0 border-t border-line bg-surface md:hidden">
      {NAV.map((item) => {
        const active = isActive(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} className="flex flex-1 flex-col items-center gap-1 py-2.5">
            <item.icon
              className="h-[18px] w-[18px]"
              strokeWidth={active ? 2.4 : 2}
              color={active ? "var(--color-primary)" : "var(--color-ink-faint)"}
            />
            <span
              className={cn("text-[9.5px]", active ? "font-semibold text-primary" : "text-ink-faint")}
            >
              {item.label.split(" ")[0]}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

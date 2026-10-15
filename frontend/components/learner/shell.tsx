"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Award, BookOpen, Home, LogOut, Search, Bell, User as UserIcon } from "lucide-react";
import { useCurrentUser, useLogout } from "@/lib/hooks/use-auth";
import { useMyOrg } from "@/lib/hooks/use-orgs";
import { useLearnSummary } from "@/lib/hooks/use-learn";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/learn", label: "Home", icon: Home, exact: true },
  { href: "/learn/courses", label: "My Courses", icon: BookOpen },
  { href: "/learn/progress", label: "Progress", icon: Award },
  { href: "/learn/profile", label: "Profile", icon: UserIcon },
];

function isActive(pathname: string, href: string, exact?: boolean) {
  return exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
}

export function LearnerSidebar() {
  const pathname = usePathname();
  const { data: user } = useCurrentUser();
  const { data: org } = useMyOrg(true);
  const logout = useLogout();
  const orgName = org?.name ?? "Riosmart LMS";

  return (
    <aside className="hidden md:flex h-full w-[226px] shrink-0 flex-col bg-rail">
      <div className="border-b border-white/10 px-5 pb-5 pt-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary font-head text-sm font-bold text-white">{orgName[0]?.toUpperCase()}</div>
          <span className="font-head text-[15px] text-white truncate">{orgName}</span>
        </div>
      </div>
      <nav className="flex-1 px-3 pt-4">
        {nav.map(({ href, label, icon: Icon, exact }) => {
          const active = isActive(pathname, href, exact);
          return (
            <Link
              key={href} href={href}
              className={cn(
                "mb-1 flex items-center gap-3 rounded px-3 py-2.5 text-[13.5px] border-l-2",
                active ? "bg-white/10 text-white border-amber" : "text-white/55 border-transparent hover:text-white/80",
              )}
            >
              <Icon className="h-[17px] w-[17px]" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="flex items-center gap-2.5 border-t border-white/10 px-5 py-4">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-amber font-head text-[11px] font-bold text-white">
          {user?.full_name?.split(" ").map((n) => n[0]).slice(0, 2).join("") || "…"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="truncate text-xs text-white">{user?.full_name || "Loading…"}</div>
          <div className="text-[11px] text-white/50">Learner</div>
        </div>
        <button type="button" onClick={logout} title="Log out"><LogOut className="h-4 w-4 text-white/50" /></button>
      </div>
    </aside>
  );
}

export function MobileTabBar() {
  const pathname = usePathname();
  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-20 flex bg-surface border-t border-line">
      {nav.map(({ href, label, icon: Icon, exact }) => {
        const active = isActive(pathname, href, exact);
        return (
          <Link key={href} href={href} className="flex-1 flex flex-col items-center gap-0.5 py-2.5">
            <Icon size={18} className={active ? "text-primary" : "text-ink-faint"} />
            <span className={cn("text-[10.5px]", active ? "text-primary font-medium" : "text-ink-faint")}>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function BellButton() {
  const router = useRouter();
  const { data } = useLearnSummary();
  return (
    <button type="button" aria-label="Notifications" onClick={() => router.push("/learn/notifications")} className="relative active:opacity-60">
      <Bell size={19} className="text-ink" />
      {data?.has_unread && <span className="absolute -top-px -right-px h-[7px] w-[7px] rounded-full bg-danger border-[1.5px] border-paper" />}
    </button>
  );
}

/** Same Topbar as the admin console (title left, search + bell right); the content below sits in a centred 1080px column. */
export function LearnerPage({
  title, search, onSearch, wide, children,
}: { title?: string; search?: string; onSearch?: (v: string) => void; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 min-h-0 flex-col">
      {title && (
        <div className="flex items-center justify-between px-4 md:px-8 h-[60px] shrink-0 bg-surface border-b border-line">
          <h1 className="font-head text-[16px] font-medium text-ink">{title}</h1>
          <div className="flex items-center gap-4">
            {onSearch && (
              <label className="flex items-center gap-2 border border-line rounded-[5px] px-3 py-1.5 md:w-[200px] focus-within:border-primary">
                <Search size={14} className="text-ink-faint shrink-0" />
                <input value={search ?? ""} onChange={(e) => onSearch(e.target.value)} placeholder="Search…"
                  className="w-24 md:w-full bg-transparent outline-none text-[12.5px] text-ink placeholder:text-ink-faint" />
              </label>
            )}
            <BellButton />
          </div>
        </div>
      )}
      <div className="flex-1 overflow-auto pb-20 md:pb-0">
        <div className={cn("mx-auto w-full px-4 md:px-8 pt-4 md:pt-6 pb-6", wide ? "max-w-[1080px]" : "max-w-[1080px]")}>{children}</div>
      </div>
    </div>
  );
}

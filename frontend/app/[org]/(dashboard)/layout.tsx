import { Sidebar } from "@/components/shell/sidebar";
import { AuthGuard } from "@/components/shell/auth-guard";

/** The org-scoped dashboard shell — every URL under this layout is
 * /{org-slug}/... (see the [org] segment). Super Admin isn't a member of
 * any customer org and never has an org_slug of their own, so they're
 * excluded here — their own pages (Organizations, Platform Settings,
 * their unprefixed /profile) live in the plain app/(dashboard) group
 * instead. AuthGuard additionally bounces anyone whose own org_slug
 * doesn't match this URL's [org] segment. */
export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={["org_admin", "team_lead", "custom"]}>
      <div className="flex h-screen overflow-hidden bg-paper">
        <Sidebar />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </AuthGuard>
  );
}

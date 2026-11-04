import { Sidebar } from "@/components/shell/sidebar";
import { AuthGuard } from "@/components/shell/auth-guard";

/** The platform-level shell — Organizations, Platform Settings, and Super
 * Admin's own unprefixed /profile. Nothing here belongs to one customer
 * org, so unlike app/[org]/(dashboard) there's no org prefix and only
 * Super Admin is let in. */
export default function PlatformDashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={["super_admin"]}>
      <div className="flex h-screen overflow-hidden bg-paper">
        <Sidebar />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </AuthGuard>
  );
}

import { Sidebar } from "@/components/shell/sidebar";
import { AuthGuard } from "@/components/shell/auth-guard";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={["super_admin", "org_admin", "team_lead"]}>
      <div className="flex h-screen overflow-hidden bg-paper">
        <Sidebar />
        <div className="flex-1 overflow-auto">{children}</div>
      </div>
    </AuthGuard>
  );
}

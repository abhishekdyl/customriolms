import { AuthGuard } from "@/components/shell/auth-guard";
import { LearnerSidebar, LearnerTabBar } from "@/components/learner/learner-nav";

/**
 * Learner shell — only learners get in (AuthGuard bounces everyone else to
 * their own home). Each page decides its own header: Home has a greeting,
 * My Courses a top bar, the course view a back link. Pages centre their
 * content at 1080px, like the prototype.
 */
export default function LearnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard allowedRoles={["learner"]}>
      <div className="flex h-screen flex-col overflow-hidden bg-paper md:flex-row">
        <LearnerSidebar />
        <main className="flex min-h-0 flex-1 flex-col overflow-auto">{children}</main>
        <LearnerTabBar />
      </div>
    </AuthGuard>
  );
}

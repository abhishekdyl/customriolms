"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { homeFor } from "@/lib/roles";

/**
 * UX guard for the two app shells. A learner who types /courses, /users, /dashboard…
 * is bounced to /learn; staff who open /learn are bounced to their own home.
 * The REAL enforcement is on the API: every admin endpoint rejects a learner token
 * with 403 and every /learn endpoint rejects non-learners — this just stops the
 * wrong screen from flashing.
 */
export function RoleGate({ area, children }: { area: "learner" | "staff"; children: React.ReactNode }) {
  const router = useRouter();
  const { data: user } = useCurrentUser();

  const allowed = !user ? null : area === "learner" ? user.role === "learner" : user.role !== "learner";

  useEffect(() => {
    if (user && !allowed) router.replace(homeFor(user.role));
  }, [user, allowed, router]);

  if (!user || !allowed) return null;
  return <>{children}</>;
}

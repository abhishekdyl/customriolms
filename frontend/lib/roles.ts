import type { RoleName } from "@/lib/types";

/** Where each role lands after login / when it opens a page that isn't theirs. */
export function homeFor(role: RoleName): string {
  if (role === "learner") return "/learn";
  if (role === "super_admin") return "/organizations";
  return "/dashboard";
}

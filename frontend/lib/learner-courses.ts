import type { MyCourse } from "@/lib/types";

export type CourseStatus = "Not started" | "In progress" | "Completed";

export const COURSE_FILTERS = ["All", "In progress", "Completed", "Not started"] as const;
export type CourseFilter = (typeof COURSE_FILTERS)[number];

/** Learner-facing status, derived from progress_pct. */
export function courseStatus(c: Pick<MyCourse, "progress_pct">): CourseStatus {
  if (c.progress_pct >= 100) return "Completed";
  if (c.progress_pct <= 0) return "Not started";
  return "In progress";
}

// Matches the labels in the prototype's moduleTypeLabel.
export const MODULE_TYPE_LABEL = {
  watch: "Watch video",
  read: "Read & acknowledge",
  quiz: "Pass quiz",
  manual: "Manual sign-off",
} as const;

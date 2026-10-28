import Link from "next/link";
import { ProgressRing } from "@/components/learner/progress-ring";
import { cn } from "@/lib/utils";
import type { MyCourse } from "@/lib/types";

// Cover colours cycle through the same four as the prototype's coverPalette.
const COVER_BG = ["bg-primary", "bg-amber", "bg-violet", "bg-cyan"];

/**
 * Course tile shared by Home and My Courses — card with a colour cover on
 * tablet/desktop, compact row on phones (same two layouts as the prototype).
 * `index` only picks the cover colour.
 */
export function CourseCard({
  course,
  index,
  subtitle,
  mobileSubtitle,
}: {
  course: MyCourse;
  index: number;
  subtitle: string;
  mobileSubtitle?: string;
}) {
  const cover = COVER_BG[index % COVER_BG.length];
  const ringColor = course.progress_pct >= 100 ? "var(--color-success)" : "var(--color-primary)";
  const href = `/learn/courses/${course.id}`;

  return (
    <>
      {/* phones: list row */}
      <Link
        href={href}
        className="flex items-center gap-3 rounded-[10px] border border-line bg-surface p-3 active:opacity-80 md:hidden"
      >
        <div className={cn("relative h-11 w-11 shrink-0 overflow-hidden rounded-[10px]", !course.cover_image_url && cover)}>
          {course.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- presigned URL
            <img src={course.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] text-ink-faint">{course.category_name}</div>
          <div className="text-[13.5px] font-medium text-ink">{course.title}</div>
          <div className="mt-0.5 text-[11.5px] text-ink-faint">{mobileSubtitle ?? subtitle}</div>
        </div>
        <ProgressRing pct={course.progress_pct} color={ringColor} />
      </Link>

      {/* tablet / desktop: card with colour cover */}
      <Link
        href={href}
        className="hidden flex-col overflow-hidden rounded-[14px] border border-line bg-surface text-left active:opacity-90 md:flex"
      >
        <div className={cn("relative h-[72px]", !course.cover_image_url && cover)}>
          {course.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element -- presigned URL
            <img src={course.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
          )}
        </div>
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-ink-faint">{course.category_name}</div>
              <div className="mt-px font-head text-[14.5px] text-ink">{course.title}</div>
            </div>
            <ProgressRing pct={course.progress_pct} color={ringColor} />
          </div>
          <div className="mt-2 text-[11.5px] text-ink-faint">{subtitle}</div>
        </div>
      </Link>
    </>
  );
}

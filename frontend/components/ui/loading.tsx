import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centered spinner for a whole page/section that has nothing to show
 * yet — use instead of letting the page render its real layout with
 * empty/zero data (which flashes "0 learners", "No teams yet", etc.
 * for a moment and then jumps to the real numbers once the fetch
 * resolves). Prefer this one shared spinner everywhere a full section
 * is waiting on its first fetch, so loading looks the same across the
 * whole app. */
export function PageLoader({ label = "Loading…", className }: { label?: string; className?: string }) {
  return (
    <div className={cn("flex flex-1 flex-col items-center justify-center gap-2 py-16 text-ink-faint", className)}>
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-[12.5px]">{label}</span>
    </div>
  );
}

/** A gray placeholder block for skeleton loading — sized by className
 * (e.g. "h-4 w-32"). Use a few of these stacked/grid-ed to hint at the
 * real layout's shape while its data is still loading, instead of a
 * single centered spinner, when the surrounding chrome (headers, tabs)
 * should stay visible and only the data-shaped parts are placeholders. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-line-soft", className)} />;
}

"use client";
import { useEffect, useState } from "react";
import { Star, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  useCourseRatingSummary, useCourseRatings, useMyCourseRating, useRatingEligibility, useSubmitCourseRating,
} from "@/lib/hooks/use-course-ratings";
import { ApiError } from "@/lib/api-client";
import { cn } from "@/lib/utils";

/** Read-only star display — average rating badges, review rows. */
export function StarRating({ value, size = 14 }: { value: number; size?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} size={size} className={n <= Math.round(value) ? "fill-amber text-amber" : "text-line"} />
      ))}
    </div>
  );
}

/** Interactive star picker used inside the rate/edit modal. */
function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  return (
    <div className="flex items-center justify-center gap-2">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)} className="p-0.5">
          <Star size={34} className={n <= (hover || value) ? "fill-amber text-amber" : "text-line"} />
        </button>
      ))}
    </div>
  );
}

/** The "Rate this course" / "Edit your rating" modal — matches the
 * reference design: title, stars, a feedback box, Submit. The
 * feedback box only appears once a rating of 1-3 is picked (per this
 * feature's own scope: low ratings ask what went wrong, 4-5 don't
 * need to be justified, so there's nothing to fill in for them and
 * the box stays hidden). */
export function RateCourseModal({ courseId, open, onOpenChange }: { courseId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: mine } = useMyCourseRating(courseId);
  const submit = useSubmitCourseRating(courseId);
  const [rating, setRating] = useState(0);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setRating(mine?.rating ?? 0);
      setText(mine?.review_text ?? "");
      setError(null);
    }
  }, [open, mine]);

  const needsText = rating > 0 && rating < 4;
  const canSubmit = rating > 0 && (!needsText || text.trim().length > 0);

  const doSubmit = () => {
    setError(null);
    submit.mutate(
      { rating, review_text: needsText ? text.trim() : (text.trim() || null) },
      { onSuccess: () => onOpenChange(false), onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't save your rating.") }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[420px] p-0">
        <div className="relative px-6 pb-6 pt-6">
          <button type="button" onClick={() => onOpenChange(false)} className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-line-soft">
            <X size={14} />
          </button>
          <h2 className="font-head text-[20px] font-bold text-primary">{mine ? "Edit your rating" : "Rate this course"}</h2>
          <div className="my-5">
            <StarPicker value={rating} onChange={setRating} />
          </div>
          {rating > 0 && (
            <textarea
              className="w-full resize-none rounded-md border border-line-soft bg-bg-soft px-3 py-2.5 text-[13px] text-ink placeholder:text-ink-faint"
              rows={3}
              placeholder={needsText
                ? "Please share what went wrong and how we can improve it for you."
                : "Please share what you liked about the course and how we can improve it for you. (optional)"}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          )}
          {error && <p className="mt-2 text-[12px] text-danger">{error}</p>}
          <button
            type="button" disabled={!canSubmit || submit.isPending} onClick={doSubmit}
            className="mt-5 w-full rounded-full bg-primary py-3 text-[14px] font-semibold text-white disabled:opacity-50"
          >
            {submit.isPending ? "Submitting…" : "Submit"}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** CTA banner — shown when the learner is eligible to rate (or already
 * has) wherever a course page wants to surface it. Nothing is rendered
 * if the learner isn't eligible yet (not enrolled, or hasn't finished
 * the first module), so this is safe to drop in unconditionally. */
export function RateCourseBanner({ courseId }: { courseId: string }) {
  const { data: elig } = useRatingEligibility(courseId);
  const { data: mine } = useMyCourseRating(courseId);
  const [open, setOpen] = useState(false);

  if (!elig?.can_rate && !mine) return null;

  return (
    <div className="mb-4 flex items-center justify-between rounded-lg border border-line bg-surface px-4 py-3">
      <div className="flex items-center gap-2.5">
        {mine ? (
          <>
            <StarRating value={mine.rating} />
            <span className="text-[12.5px] text-ink-faint">You rated this course</span>
          </>
        ) : (
          <span className="text-[13px] text-ink">How's this course going for you?</span>
        )}
      </div>
      <button type="button" onClick={() => setOpen(true)} className="text-[12.5px] font-medium text-primary">
        {mine ? "Edit rating" : "Rate this course"}
      </button>
      <RateCourseModal courseId={courseId} open={open} onOpenChange={setOpen} />
    </div>
  );
}

/** The Reviews tab's content — average + distribution + anonymized
 * review list. No reviewer identity anywhere here (see CourseRating's
 * own doc comment in lib/types.ts). */
export function CourseReviewsPanel({ courseId }: { courseId: string }) {
  const { data: summary } = useCourseRatingSummary(courseId);
  const { data: reviews = [] } = useCourseRatings(courseId);

  const maxCount = Math.max(1, ...Object.values(summary?.distribution ?? {}));

  return (
    <div className="flex flex-col gap-5">
      <RateCourseBanner courseId={courseId} />

      <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5 sm:flex-row sm:items-center sm:gap-8">
        <div className="flex flex-col items-center gap-1">
          <span className="text-[32px] font-bold leading-none text-ink">{summary?.average?.toFixed(1) ?? "–"}</span>
          <StarRating value={summary?.average ?? 0} size={16} />
          <span className="text-[11.5px] text-ink-faint">{summary?.count ?? 0} rating{summary?.count === 1 ? "" : "s"}</span>
        </div>
        <div className="flex flex-1 flex-col gap-1">
          {[5, 4, 3, 2, 1].map((n) => {
            const count = summary?.distribution?.[n] ?? 0;
            return (
              <div key={n} className="flex items-center gap-2 text-[11px] text-ink-faint">
                <span className="w-2.5 text-right">{n}</span>
                <Star size={10} className="fill-amber text-amber" />
                <div className="h-1.5 flex-1 rounded-full bg-line-soft">
                  <div className="h-full rounded-full bg-amber" style={{ width: `${(count / maxCount) * 100}%` }} />
                </div>
                <span className="w-5 text-right">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {reviews.length === 0 && <p className="text-[12.5px] text-ink-faint">No reviews yet.</p>}
        {reviews.map((r) => (
          <div key={r.id} className={cn("rounded-lg border border-line-soft bg-surface px-4 py-3")}>
            <div className="flex items-center justify-between">
              <StarRating value={r.rating} size={13} />
              <span className="text-[11px] text-ink-faint">{new Date(r.created_at).toLocaleDateString()}</span>
            </div>
            {r.review_text && <p className="mt-1.5 text-[12.5px] text-ink">{r.review_text}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

"use client";
import { useState } from "react";
import { Trash2, Pencil, X, Check } from "lucide-react";
import { StarRating } from "@/components/learner/course-rating";
import { useCourseRatingsAdmin, useDeleteCourseRating, useModerateCourseRating } from "@/lib/hooks/use-course-ratings";

/** Moderation list — Org Admin or this course's own creator only (the
 * page deciding whether to show this tab at all is the real gate;
 * the backend enforces the same rule independently). Can edit a
 * review's TEXT (e.g. redact something) or delete it outright — never
 * change the star rating itself, since that's the learner's own
 * honest opinion, not something to moderate. */
export function CourseReviewsAdminPanel({ courseId }: { courseId: string }) {
  const { data: reviews = [], isLoading } = useCourseRatingsAdmin(courseId);
  const moderate = useModerateCourseRating(courseId);
  const remove = useDeleteCourseRating(courseId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState("");
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  if (isLoading) return <p className="text-[12.5px] text-ink-faint">Loading…</p>;
  if (reviews.length === 0) return <p className="text-[12.5px] text-ink-faint">No reviews yet for this course.</p>;

  return (
    <div className="flex flex-col gap-2.5">
      {reviews.map((r) => (
        <div key={r.id} className="rounded-lg border border-line bg-surface p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <StarRating value={r.rating} />
                <span className="text-[12.5px] font-medium text-ink">{r.user_name}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-ink-faint">{r.user_email} · {new Date(r.created_at).toLocaleDateString()}</p>
            </div>
            {editingId !== r.id && (
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => { setEditingId(r.id); setDraftText(r.review_text ?? ""); }} className="rounded-md p-1.5 hover:bg-line-soft" title="Edit text">
                  <Pencil size={13} className="text-ink-faint" />
                </button>
                <button type="button" onClick={() => setConfirmingId(r.id)} className="rounded-md p-1.5 hover:bg-line-soft" title="Delete">
                  <Trash2 size={13} className="text-danger" />
                </button>
              </div>
            )}
          </div>

          {editingId === r.id ? (
            <div className="mt-2.5 flex flex-col gap-2">
              <textarea
                className="w-full resize-none rounded-md border border-line-soft bg-bg-soft px-2.5 py-2 text-[12.5px]"
                rows={2} value={draftText} onChange={(e) => setDraftText(e.target.value)}
              />
              <div className="flex items-center gap-2">
                <button
                  type="button" disabled={moderate.isPending}
                  onClick={() => moderate.mutate({ id: r.id, review_text: draftText.trim() || null }, { onSuccess: () => setEditingId(null) })}
                  className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-white"
                >
                  <Check size={11} /> Save
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] text-ink-faint">
                  <X size={11} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            r.review_text && <p className="mt-2 text-[12.5px] text-ink">{r.review_text}</p>
          )}

          {confirmingId === r.id && (
            <div className="mt-2.5 flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2">
              <span className="text-[11.5px] text-danger">Delete this review permanently?</span>
              <button
                type="button" disabled={remove.isPending}
                onClick={() => remove.mutate(r.id, { onSuccess: () => setConfirmingId(null) })}
                className="ml-auto rounded-md bg-danger px-2.5 py-1 text-[11px] font-medium text-white"
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirmingId(null)} className="text-[11px] text-ink-faint">Cancel</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

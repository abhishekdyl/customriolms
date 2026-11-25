"use client";
import { useState } from "react";
import { MessageSquare, Send, ShieldCheck, Trash2 } from "lucide-react";
import {
  useAnnouncementComments, useCreateAnnouncementComment, useDeleteAnnouncementComment,
} from "@/lib/hooks/use-course-announcements";
import { cn } from "@/lib/utils";

/** Shared by both the course-manage Announcements admin panel and the
 * learner/teacher-facing Announcements tab — same thread, same rules,
 * just a different canDelete (moderation is Teacher/Admin-only either
 * way; the backend enforces this independently). Collapsed by default
 * behind a "N comments" toggle so a long announcement list doesn't turn
 * into one huge wall of replies. */
export function AnnouncementCommentThread({
  courseId, announcementId, commentsEnabled, commentCount, canDelete,
}: { courseId: string; announcementId: string; commentsEnabled: boolean; commentCount: number; canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const { data: comments = [], isLoading } = useAnnouncementComments(courseId, open ? announcementId : "");
  const create = useCreateAnnouncementComment(courseId, announcementId);
  const remove = useDeleteAnnouncementComment(courseId, announcementId);

  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    create.mutate(body, { onSuccess: () => setDraft("") });
  };

  return (
    <div className="mt-2.5 border-t border-line-soft pt-2.5">
      <button
        type="button" onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-[11.5px] font-medium text-ink-faint hover:text-ink"
      >
        <MessageSquare size={12} />
        {commentCount > 0 ? `${commentCount} comment${commentCount === 1 ? "" : "s"}` : "No comments yet"}
        {!commentsEnabled && <span className="rounded-full bg-line-soft px-2 py-0.5 text-[10px] text-ink-faint">Comments off</span>}
      </button>

      {open && (
        <div className="mt-2 flex flex-col gap-2 pl-1">
          {isLoading && <p className="text-[11.5px] text-ink-faint">Loading…</p>}
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 rounded-md bg-bg-soft px-2.5 py-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11.5px] font-medium text-ink">{c.author_name ?? "Unknown"}</span>
                  {c.is_manager && (
                    <span className="flex items-center gap-0.5 rounded-full bg-primary-soft px-1.5 py-0.5 text-[9.5px] font-medium text-primary">
                      <ShieldCheck size={9} /> Staff
                    </span>
                  )}
                  <span className="text-[10.5px] text-ink-faint">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink">{c.body}</p>
              </div>
              {canDelete && (
                <button
                  type="button" title="Delete comment"
                  onClick={() => remove.mutate(c.id)}
                  className="shrink-0 rounded p-1 hover:bg-line-soft"
                >
                  <Trash2 size={12} className="text-danger" />
                </button>
              )}
            </div>
          ))}

          {commentsEnabled ? (
            <div className="flex items-center gap-2">
              <input
                className="flex-1 rounded-md border border-line-soft bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-primary"
                placeholder="Write a comment…" value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              />
              <button
                type="button" disabled={!draft.trim() || create.isPending} onClick={submit}
                className={cn("flex items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-[11.5px] font-medium text-white", (!draft.trim() || create.isPending) && "opacity-50")}
              >
                <Send size={11} />
              </button>
            </div>
          ) : (
            <p className="text-[11.5px] text-ink-faint">Comments are turned off for this announcement.</p>
          )}
        </div>
      )}
    </div>
  );
}

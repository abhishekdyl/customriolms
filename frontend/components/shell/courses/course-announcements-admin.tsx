"use client";
import { useState } from "react";
import { Eye, EyeOff, Megaphone, MessageSquareOff, MessageSquareText, Pencil, Plus, Trash2, X, Check } from "lucide-react";
import {
  useCourseAnnouncements, useCreateCourseAnnouncement, useDeleteCourseAnnouncement, useUpdateCourseAnnouncement,
} from "@/lib/hooks/use-course-announcements";
import { AnnouncementCommentThread } from "./announcement-comment-thread";
import { cn } from "@/lib/utils";

const inputCls = "w-full rounded-md border border-line-soft bg-bg-soft px-2.5 py-2 text-[12.5px] outline-none focus:border-primary";

/** Teacher/Org Admin view of a course's announcement board — add, edit,
 * hide/unhide, and permanently delete. Mirrors CourseReviewsAdminPanel's
 * layout. The page deciding whether to show this tab at all (canManage)
 * is the real gate; the backend enforces the same can_manage rule
 * independently either way. */
export function CourseAnnouncementsAdminPanel({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const { data: rows = [], isLoading } = useCourseAnnouncements(courseId);
  const create = useCreateCourseAnnouncement(courseId);
  const update = useUpdateCourseAnnouncement(courseId);
  const remove = useDeleteCourseAnnouncement(courseId);

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ title: "", body: "" });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState({ title: "", body: "" });
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const startEdit = (id: string, title: string, body: string) => {
    setEditingId(id); setEditDraft({ title, body });
  };

  return (
    <div className="flex flex-col gap-3">
      {!canManage && (
        <p className="text-[11.5px] text-ink-faint">Only an Org Admin or this course's own Teacher can post, edit, hide, or delete announcements.</p>
      )}
      {canManage && !adding ? (
        <button
          type="button" onClick={() => setAdding(true)}
          className="flex w-fit items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-white"
        >
          <Plus size={13} /> New announcement
        </button>
      ) : canManage && (
        <div className="rounded-lg border border-line bg-surface p-4">
          <input className={cn(inputCls, "mb-2")} placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
          <textarea className={inputCls} rows={3} placeholder="Announcement text" value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button" disabled={!draft.title.trim() || !draft.body.trim() || create.isPending}
              onClick={() => create.mutate(draft, { onSuccess: () => { setDraft({ title: "", body: "" }); setAdding(false); } })}
              className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-50"
            >
              Post
            </button>
            <button type="button" onClick={() => { setAdding(false); setDraft({ title: "", body: "" }); }} className="text-[12px] text-ink-faint">Cancel</button>
          </div>
        </div>
      )}

      {isLoading && <p className="text-[12.5px] text-ink-faint">Loading…</p>}
      {!isLoading && rows.length === 0 && <p className="text-[12.5px] text-ink-faint">No announcements yet.</p>}

      {rows.map((a) => (
        <div key={a.id} className={cn("rounded-lg border p-4", a.is_hidden ? "border-line-soft bg-bg-soft" : "border-line bg-surface")}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Megaphone size={14} className={a.is_hidden ? "text-ink-faint" : "text-primary"} />
              {editingId === a.id ? (
                <input className={inputCls} value={editDraft.title} onChange={(e) => setEditDraft({ ...editDraft, title: e.target.value })} />
              ) : (
                <span className={cn("text-[13px] font-medium", a.is_hidden ? "text-ink-faint" : "text-ink")}>{a.title}</span>
              )}
              {a.is_hidden && <span className="rounded-full bg-line-soft px-2 py-0.5 text-[10px] font-medium text-ink-faint">Hidden</span>}
            </div>
            {canManage && editingId !== a.id && (
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button" title={a.is_hidden ? "Unhide" : "Hide"}
                  onClick={() => update.mutate({ id: a.id, is_hidden: !a.is_hidden })}
                  className="rounded-md p-1.5 hover:bg-line-soft"
                >
                  {a.is_hidden ? <Eye size={13} className="text-ink-faint" /> : <EyeOff size={13} className="text-ink-faint" />}
                </button>
                <button type="button" title="Edit" onClick={() => startEdit(a.id, a.title, a.body)} className="rounded-md p-1.5 hover:bg-line-soft">
                  <Pencil size={13} className="text-ink-faint" />
                </button>
                <button
                  type="button" title={a.comments_enabled ? "Turn off comments" : "Turn on comments"}
                  onClick={() => update.mutate({ id: a.id, comments_enabled: !a.comments_enabled })}
                  className="rounded-md p-1.5 hover:bg-line-soft"
                >
                  {a.comments_enabled ? <MessageSquareText size={13} className="text-ink-faint" /> : <MessageSquareOff size={13} className="text-ink-faint" />}
                </button>
                <button type="button" title="Delete" onClick={() => setConfirmingId(a.id)} className="rounded-md p-1.5 hover:bg-line-soft">
                  <Trash2 size={13} className="text-danger" />
                </button>
              </div>
            )}
          </div>

          <p className="mt-0.5 text-[11px] text-ink-faint">
            {a.author_name ?? "Unknown"} · {new Date(a.created_at).toLocaleDateString()}
          </p>

          {editingId === a.id ? (
            <div className="mt-2.5 flex flex-col gap-2">
              <textarea className={inputCls} rows={3} value={editDraft.body} onChange={(e) => setEditDraft({ ...editDraft, body: e.target.value })} />
              <div className="flex items-center gap-2">
                <button
                  type="button" disabled={!editDraft.title.trim() || !editDraft.body.trim() || update.isPending}
                  onClick={() => update.mutate({ id: a.id, title: editDraft.title, body: editDraft.body }, { onSuccess: () => setEditingId(null) })}
                  className="flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-[11.5px] font-medium text-white disabled:opacity-50"
                >
                  <Check size={11} /> Save
                </button>
                <button type="button" onClick={() => setEditingId(null)} className="flex items-center gap-1 rounded-md px-2.5 py-1 text-[11.5px] text-ink-faint">
                  <X size={11} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <p className={cn("mt-2 whitespace-pre-wrap text-[12.5px]", a.is_hidden ? "text-ink-faint" : "text-ink")}>{a.body}</p>
          )}

          {confirmingId === a.id && (
            <div className="mt-2.5 flex items-center gap-2 rounded-md bg-danger-soft px-3 py-2">
              <span className="text-[11.5px] text-danger">Delete this announcement permanently?</span>
              <button
                type="button" disabled={remove.isPending}
                onClick={() => remove.mutate(a.id, { onSuccess: () => setConfirmingId(null) })}
                className="ml-auto rounded-md bg-danger px-2.5 py-1 text-[11px] font-medium text-white"
              >
                Delete
              </button>
              <button type="button" onClick={() => setConfirmingId(null)} className="text-[11px] text-ink-faint">Cancel</button>
            </div>
          )}

          <AnnouncementCommentThread
            courseId={courseId} announcementId={a.id}
            commentsEnabled={a.comments_enabled} commentCount={a.comment_count} canDelete={canManage}
          />
        </div>
      ))}
    </div>
  );
}

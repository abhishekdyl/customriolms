"use client";
import { Megaphone } from "lucide-react";
import { useCourseAnnouncements } from "@/lib/hooks/use-course-announcements";

/** Read-only announcement board for a learner/teacher viewing a
 * course's own page — the backend already drops hidden announcements
 * for anyone who isn't a manager, so this just renders whatever list
 * comes back. */
export function CourseAnnouncementsPanel({ courseId }: { courseId: string }) {
  const { data: rows = [], isLoading } = useCourseAnnouncements(courseId);

  if (isLoading) return <p className="text-[12.5px] text-ink-faint">Loading…</p>;
  if (rows.length === 0) return <p className="text-[13px] text-ink-faint">No announcements for this course yet.</p>;

  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((a) => (
        <div key={a.id} className="rounded-lg border border-line-soft bg-surface p-4">
          <div className="flex items-center gap-2">
            <Megaphone size={14} color="var(--color-primary)" />
            <span className="text-[13px] font-medium text-ink">{a.title}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-ink-faint">
            {a.author_name ?? "Instructor"} · {new Date(a.created_at).toLocaleDateString()}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-[12.5px] text-ink">{a.body}</p>
        </div>
      ))}
    </div>
  );
}

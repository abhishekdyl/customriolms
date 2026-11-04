"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Link2, Pencil, Trash2, Check, Square, CheckSquare, Copy, Download, Loader2 } from "lucide-react";
import { useUpdateCourse, useDeleteCourse, useDuplicateCourse, useExportCourse } from "@/lib/hooks/use-courses";
import { ApiError } from "@/lib/api-client";
import type { Category, CourseListItem } from "@/lib/types";

/** "My Course Title" -> "my-course-title.json", for the exported file's
 * download name. */
function slugFilename(title: string): string {
  return `${title.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "course"}.json`;
}

export function CourseCard({
  course: c,
  categories,
  canManage,
  canAssign,
  selected,
  onToggleSelect,
  onAssign,
}: {
  course: CourseListItem;
  categories: Category[];
  // courses.manage (duplicate/export/edit/delete) and courses.assign
  // (the Assign action) are separate server-side capabilities, so a
  // custom role can be granted either one independently.
  canManage: boolean;
  canAssign: boolean;
  selected: boolean;
  onToggleSelect: ((id: string) => void) | null;
  onAssign: (id: string) => void;
}) {
  const router = useRouter();
  const { org } = useParams<{ org: string }>();
  const updateCourse = useUpdateCourse(c.id);
  const deleteCourse = useDeleteCourse();
  const duplicateCourse = useDuplicateCourse();
  const exportCourse = useExportCourse();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [draftTitle, setDraftTitle] = useState(c.title);
  const [draftCategoryId, setDraftCategoryId] = useState(c.category_id ?? "");
  const [draftDuration, setDraftDuration] = useState(c.duration_label);

  // One click: copies the course (same org, full fidelity — see
  // useDuplicateCourse) then takes the admin straight to the copy's
  // Settings tab to rename/re-category it if they want.
  const duplicate = () => {
    duplicateCourse.mutate({ courseId: c.id }, { onSuccess: (newCourse) => router.push(`/${org}/courses/${newCourse.id}`) });
  };

  // Downloads the course's structural config as a .json file the admin
  // can hand to POST /courses/import on another org/environment — see
  // useExportCourse's docstring on what isn't included (real file bytes).
  const exportCourseFile = () => {
    setExportError(null);
    exportCourse.mutate(c.id, {
      onSuccess: (file) => {
        const blob = new Blob([JSON.stringify(file, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = slugFilename(c.title);
        a.click();
        URL.revokeObjectURL(url);
      },
      onError: (err) => setExportError(err instanceof ApiError ? err.message : "Couldn't export this course."),
    });
  };

  const color = categories.find((cat) => cat.id === c.category_id)?.color || "var(--color-ink-faint)";

  const copyShareLink = () => {
    navigator.clipboard?.writeText(`${window.location.origin}/courses/${c.id}`);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const saveEdit = () => {
    updateCourse.mutate(
      { title: draftTitle, category_id: draftCategoryId || null, duration_label: draftDuration },
      { onSuccess: () => setEditing(false) }
    );
  };

  if (confirmDel) {
    return (
      <div className="rounded-[10px] border border-line bg-surface p-4">
        <p className="mb-3 text-sm text-ink">Delete &quot;{c.title}&quot;?</p>
        <div className="flex gap-2">
          <button onClick={() => deleteCourse.mutate(c.id)} className="rounded-md bg-danger px-3 py-1.5 text-xs font-medium text-white">Delete</button>
          <button onClick={() => setConfirmDel(false)} className="rounded-md px-3 py-1.5 text-xs text-ink-soft">Cancel</button>
        </div>
      </div>
    );
  }

  if (editing) {
    return (
      <div className="rounded-[10px] border-[1.5px] border-primary bg-surface p-4">
        <input
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          className="mb-2 w-full rounded-md border border-line px-2.5 py-1.5 text-[13.5px] outline-none"
        />
        <div className="mb-3 flex gap-2">
          <select
            value={draftCategoryId}
            onChange={(e) => setDraftCategoryId(e.target.value)}
            className="flex-1 rounded-md border border-line px-2 py-1.5 text-xs"
          >
            <option value="">No category</option>
            {categories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
          </select>
          <input
            value={draftDuration}
            onChange={(e) => setDraftDuration(e.target.value)}
            placeholder="45 min"
            className="w-[90px] rounded-md border border-line px-2 py-1.5 text-xs"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={saveEdit} disabled={updateCourse.isPending} className="rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-white">
            {updateCourse.isPending ? "Saving…" : "Save"}
          </button>
          <button onClick={() => setEditing(false)} className="px-3.5 py-1.5 text-xs text-ink-soft">Cancel</button>
        </div>
      </div>
    );
  }

  // The whole card (cover image, title, "Manage") opens the same course
  // management page — only the select checkbox, edit/delete icons, the
  // copy-link button, and "Assign" are separate actions, so each of
  // those stops the click from bubbling up to this handler.
  const goToManage = () => router.push(`/${org}/courses/${c.id}`);
  const stop = (e: React.MouseEvent) => e.stopPropagation();

  return (
    <div
      onClick={goToManage}
      className={`cursor-pointer rounded-[10px] border-[1.5px] bg-surface ${selected ? "border-primary" : "border-line"}`}
    >
      <div className="relative h-[84px] overflow-hidden rounded-t-[10px]" style={c.cover_image_url ? undefined : { background: color }}>
        {c.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- presigned URL, not a static asset Next can optimize
          <img src={c.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
        {onToggleSelect && (
          <button
            onClick={(e) => { stop(e); onToggleSelect(c.id); }}
            className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded"
            style={{ border: `1.5px solid ${selected ? "#fff" : "rgba(255,255,255,0.6)"}`, background: selected ? "#fff" : "rgba(0,0,0,0.15)" }}
          >
            {selected ? <Check className="h-3 w-3" style={{ color }} /> : null}
          </button>
        )}
      </div>
      <div className="p-4">
        <div className="mb-1.5 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-[11.5px] text-ink-faint">{c.category_name ?? "Uncategorized"}</span>
            {!c.published && (
              <span
                title="Not visible to any learner yet, even if already assigned — publish it from the Settings tab"
                className="rounded-full bg-ink-faint/15 px-2 py-0.5 text-[10px] font-medium text-ink-soft"
              >
                Draft
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <span className="mr-1 text-[11.5px] text-ink-faint">{c.duration_label}</span>
            <button onClick={(e) => { stop(e); copyShareLink(); }} title="Copy shareable course link" className="rounded p-1 hover:bg-paper">
              {linkCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5 text-ink-faint" />}
            </button>
            {canManage && (
              <>
                <button
                  onClick={(e) => { stop(e); duplicate(); }} disabled={duplicateCourse.isPending}
                  title="Duplicate this course — same modules, restrictions, grading, as a new draft"
                  className="rounded p-1 hover:bg-paper disabled:opacity-40"
                >
                  {duplicateCourse.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" /> : <Copy className="h-3.5 w-3.5 text-ink-faint" />}
                </button>
                <button
                  onClick={(e) => { stop(e); exportCourseFile(); }} disabled={exportCourse.isPending}
                  title="Export as a file — to import into another org/environment"
                  className="rounded p-1 hover:bg-paper disabled:opacity-40"
                >
                  {exportCourse.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" /> : <Download className="h-3.5 w-3.5 text-ink-faint" />}
                </button>
                <button onClick={(e) => { stop(e); setEditing(true); }} title="Edit course" className="rounded p-1 hover:bg-paper">
                  <Pencil className="h-3.5 w-3.5 text-ink-faint" />
                </button>
                <button onClick={(e) => { stop(e); setConfirmDel(true); }} title="Delete course" className="rounded p-1 hover:bg-paper">
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </button>
              </>
            )}
          </div>
        </div>
        <div className="mb-0.5 font-head text-[15.5px] text-ink">{c.title}</div>
        <div className="mb-2.5 text-[11.5px] text-ink-faint">
          {c.module_count} module{c.module_count !== 1 ? "s" : ""} · Assigned to {c.assigned_team_count} team{c.assigned_team_count !== 1 ? "s" : ""}
        </div>
        {exportError && <p onClick={stop} className="mb-2 text-[10.5px] text-danger">{exportError}</p>}
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] font-medium text-ink-soft">Manage</span>
          {canAssign && (
            <button onClick={(e) => { stop(e); onAssign(c.id); }} className="text-[12.5px] font-medium text-ink-soft">Assign</button>
          )}
        </div>
      </div>
    </div>
  );
}

export function CourseCardSelectIcon({ selected }: { selected: boolean }) {
  return selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-ink-faint" />;
}

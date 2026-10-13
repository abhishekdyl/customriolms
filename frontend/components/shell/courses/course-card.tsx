"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Link2, Pencil, Trash2, Check, Square, CheckSquare } from "lucide-react";
import { useUpdateCourse, useDeleteCourse } from "@/lib/hooks/use-courses";
import type { Category, CourseListItem } from "@/lib/types";

export function CourseCard({
  course: c,
  categories,
  canAuthor,
  selected,
  onToggleSelect,
  onAssign,
  onPreview,
}: {
  course: CourseListItem;
  categories: Category[];
  canAuthor: boolean;
  selected: boolean;
  onToggleSelect: ((id: string) => void) | null;
  onAssign: (id: string) => void;
  onPreview: (id: string) => void;
}) {
  const router = useRouter();
  const updateCourse = useUpdateCourse(c.id);
  const deleteCourse = useDeleteCourse();
  const [editing, setEditing] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [draftTitle, setDraftTitle] = useState(c.title);
  const [draftCategoryId, setDraftCategoryId] = useState(c.category_id ?? "");
  const [draftDuration, setDraftDuration] = useState(c.duration_label);

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

  return (
    <div className={`rounded-[10px] border-[1.5px] bg-surface ${selected ? "border-primary" : "border-line"}`}>
      <div className="relative h-[84px] rounded-t-[10px]" style={{ background: color }}>
        {onToggleSelect && (
          <button
            onClick={() => onToggleSelect(c.id)}
            className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded"
            style={{ border: `1.5px solid ${selected ? "#fff" : "rgba(255,255,255,0.6)"}`, background: selected ? "#fff" : "rgba(0,0,0,0.15)" }}
          >
            {selected ? <Check className="h-3 w-3" style={{ color }} /> : null}
          </button>
        )}
      </div>
      <div className="p-4">
        <div className="mb-1.5 flex items-center justify-between">
          <span className="text-[11.5px] text-ink-faint">{c.category_name ?? "Uncategorized"}</span>
          <div className="flex items-center gap-0.5">
            <span className="mr-1 text-[11.5px] text-ink-faint">{c.duration_label}</span>
            <button onClick={copyShareLink} title="Copy shareable course link" className="rounded p-1 hover:bg-paper">
              {linkCopied ? <Check className="h-3.5 w-3.5 text-success" /> : <Link2 className="h-3.5 w-3.5 text-ink-faint" />}
            </button>
            {canAuthor && (
              <>
                <button onClick={() => setEditing(true)} title="Edit course" className="rounded p-1 hover:bg-paper">
                  <Pencil className="h-3.5 w-3.5 text-ink-faint" />
                </button>
                <button onClick={() => setConfirmDel(true)} title="Delete course" className="rounded p-1 hover:bg-paper">
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
        <div className="flex items-center justify-between">
          <div className="flex gap-3">
            <button onClick={() => router.push(`/courses/${c.id}`)} className="text-[12.5px] font-medium text-ink-soft">Manage</button>
            {canAuthor && <button onClick={() => onAssign(c.id)} className="text-[12.5px] font-medium text-ink-soft">Assign</button>}
          </div>
          <button onClick={() => onPreview(c.id)} className="text-[12.5px] font-medium text-primary">Preview →</button>
        </div>
      </div>
    </div>
  );
}

export function CourseCardSelectIcon({ selected }: { selected: boolean }) {
  return selected ? <CheckSquare className="h-4 w-4 text-primary" /> : <Square className="h-4 w-4 text-ink-faint" />;
}

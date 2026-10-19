"use client";
import { useState } from "react";
import { Plus, Trash2, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCourses, useCreateCourse, useDeleteCourse } from "@/lib/hooks/use-courses";
import { useCategories } from "@/lib/hooks/use-categories";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { CategoryManager } from "@/components/shell/courses/category-manager";
import { AssignModal } from "@/components/shell/courses/assign-modal";
import { CourseCard } from "@/components/shell/courses/course-card";
import { CoursePreviewModal } from "@/components/shell/courses/course-preview-modal";
import { ApiError } from "@/lib/api-client";
import { localToIso, nowLocal } from "@/lib/utils";

function CreateCourseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data: categories } = useCategories();
  const createCourse = useCreateCourse();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  // opens_at is mandatory (see useCreateCourse) — pre-filled to right now
  // so the form starts valid rather than forcing an extra click.
  const [opensAt, setOpensAt] = useState(() => nowLocal());
  const [closesAt, setClosesAt] = useState("");
  const minDate = nowLocal();

  const dateError = closesAt && closesAt <= opensAt;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !opensAt || dateError) return;
    createCourse.mutate(
      {
        title: title.trim(), category_id: categoryId || null,
        opens_at: localToIso(opensAt), closes_at: closesAt ? localToIso(closesAt) : null,
      },
      {
        onSuccess: () => {
          setTitle(""); setOpensAt(nowLocal()); setClosesAt("");
          onOpenChange(false);
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New course</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="flex flex-col gap-3.5 p-6">
          {createCourse.isError && (
            <p className="rounded-lg bg-danger-soft px-3 py-2 text-xs text-danger">
              {createCourse.error instanceof ApiError ? createCourse.error.message : "Couldn't create the course."}
            </p>
          )}
          <p className="text-xs text-ink-faint">
            Start with just a title — you&apos;ll add modules, quizzes, completion rules and a cover image on the next screen.
          </p>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Course title" autoFocus required />
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-10 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus-visible:border-primary"
          >
            <option value="">No category</option>
            {categories?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <p className="mb-1 text-[11px] text-ink-soft">Opens / create date *</p>
              <input
                type="datetime-local" value={opensAt} min={minDate} required
                onChange={(e) => setOpensAt(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs outline-none focus-visible:border-primary"
              />
            </div>
            <div>
              <p className="mb-1 text-[11px] text-ink-soft">Closes (optional)</p>
              <input
                type="datetime-local" value={closesAt} min={minDate}
                onChange={(e) => setClosesAt(e.target.value)}
                className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-xs outline-none focus-visible:border-primary"
              />
            </div>
          </div>
          {dateError && <p className="text-xs text-danger">Close date must be after the open date.</p>}
          <p className="text-[11px] text-ink-faint">
            The open date can&apos;t be in the past, and a close date (if set) must be later than it. After closing,
            no one new can be assigned and learners can&apos;t make further progress — anything already completed stays.
          </p>

          <Button type="submit" disabled={createCourse.isPending || !opensAt || !!dateError}>
            {createCourse.isPending ? "Creating…" : "Create & add modules"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function CoursesPage() {
  const { data: courses, isLoading, isError } = useCourses();
  const { data: categories } = useCategories();
  const { data: currentUser } = useCurrentUser();
  const del = useDeleteCourse();

  const canAuthor = currentUser?.role === "org_admin" || currentUser?.role === "super_admin";

  const [filter, setFilter] = useState("All");
  const [managingCats, setManagingCats] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigningCourseId, setAssigningCourseId] = useState<string | null>(null);
  const [bulkAssignIds, setBulkAssignIds] = useState<string[] | null>(null);
  const [previewingId, setPreviewingId] = useState<string | null>(null);

  const catNames = ["All", ...(categories?.map((c) => c.name) ?? [])];
  const shown = filter === "All" ? courses : courses?.filter((c) => c.category_name === filter);

  const toggleSelect = (id: string) => setSelected((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const clearSelection = () => { setSelected([]); setSelectMode(false); };

  const bulkDelete = () => {
    if (!confirm(`Delete ${selected.length} course(s)? This can't be undone.`)) return;
    selected.forEach((id) => del.mutate(id));
    clearSelection();
  };

  return (
    <div className="p-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2 overflow-x-auto pb-0.5">
          {catNames.map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`flex-shrink-0 rounded-full border px-3.5 py-1.5 text-xs ${
                filter === c ? "border-ink bg-ink text-white" : "border-line text-ink-soft"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => { if (selectMode) clearSelection(); else setSelectMode(true); }}
          >
            {selectMode ? "Cancel" : "Select"}
          </Button>
          {canAuthor && (
            <Button variant="secondary" size="sm" onClick={() => setManagingCats(!managingCats)}>
              <Tag className="h-3.5 w-3.5" /> {managingCats ? "Done" : "Categories"}
            </Button>
          )}
          {canAuthor && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-3.5 w-3.5" /> New course
            </Button>
          )}
        </div>
      </div>

      {selectMode && selected.length > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg bg-ink px-4 py-2.5">
          <span className="text-xs text-white">{selected.length} selected</span>
          <button onClick={() => setBulkAssignIds(selected)} className="rounded-md bg-white/15 px-2.5 py-1 text-xs text-white">
            Assign to team(s)
          </button>
          <button onClick={bulkDelete} className="flex items-center gap-1 rounded-md px-2.5 py-1 text-xs text-danger-soft">
            <Trash2 className="h-3 w-3" /> Delete selected
          </button>
          <button onClick={clearSelection} className="ml-auto">
            <X className="h-3.5 w-3.5 text-white/60" />
          </button>
        </div>
      )}

      {managingCats && <CategoryManager categories={categories ?? []} />}

      {isLoading && <p className="text-sm text-ink-faint">Loading courses…</p>}
      {isError && <p className="text-sm text-danger">Couldn&apos;t load courses — is the backend running?</p>}

      <div className="grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))" }}>
        {shown?.map((c) => (
          <CourseCard
            key={c.id}
            course={c}
            categories={categories ?? []}
            canAuthor={canAuthor}
            selected={selected.includes(c.id)}
            onToggleSelect={selectMode ? toggleSelect : null}
            onAssign={setAssigningCourseId}
            onPreview={setPreviewingId}
          />
        ))}
        {shown?.length === 0 && <p className="text-sm text-ink-faint">No courses in this category yet.</p>}
      </div>

      <CreateCourseDialog open={createOpen} onOpenChange={setCreateOpen} />
      {assigningCourseId && <AssignModal courseId={assigningCourseId} onClose={() => setAssigningCourseId(null)} />}
      {bulkAssignIds && <AssignModal courseIds={bulkAssignIds} onClose={() => { setBulkAssignIds(null); clearSelection(); }} />}
      {previewingId && <CoursePreviewModal courseId={previewingId} onClose={() => setPreviewingId(null)} />}
    </div>
  );
}

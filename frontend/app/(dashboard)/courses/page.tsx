"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Tag, X, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useCourses, useCreateCourse, useDeleteCourse, useImportCourse } from "@/lib/hooks/use-courses";
import { useCategories } from "@/lib/hooks/use-categories";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { CategoryManager } from "@/components/shell/courses/category-manager";
import { AssignModal } from "@/components/shell/courses/assign-modal";
import { CourseCard } from "@/components/shell/courses/course-card";
import { ApiError } from "@/lib/api-client";
import { localToIso, nowLocal } from "@/lib/utils";
import type { CourseExportFile } from "@/lib/types";

function ImportCourseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const router = useRouter();
  const importCourse = useImportCourse();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<CourseExportFile | null>(null);

  const reset = () => { setParseError(null); setFileName(null); setParsed(null); importCourse.reset(); };

  const pickFile = async (file: File) => {
    setParseError(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      if (json?.format !== "riosmart-course-export-v1") {
        setParseError("This doesn't look like a course export file.");
        setParsed(null);
        return;
      }
      setParsed(json);
    } catch {
      setParseError("Couldn't read that file — is it a course export .json?");
      setParsed(null);
    }
  };

  const confirmImport = () => {
    if (!parsed) return;
    importCourse.mutate({ file: parsed });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import a course</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3.5 p-6">
          {importCourse.isSuccess ? (
            <>
              <p className="rounded-lg bg-success-soft px-3 py-2 text-xs text-success">
                Imported as &quot;{importCourse.data.course.title}&quot; — it starts as a draft.
              </p>
              {importCourse.data.warnings.length > 0 && (
                <div className="rounded-lg bg-amber-soft px-3 py-2 text-xs text-amber">
                  <p className="mb-1 font-medium">Needs your attention:</p>
                  <ul className="list-disc space-y-0.5 pl-4">
                    {importCourse.data.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={() => router.push(`/courses/${importCourse.data.course.id}`)}>Open course</Button>
                <Button variant="secondary" onClick={() => { reset(); onOpenChange(false); }}>Close</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-xs text-ink-faint">
                Brings back a course&apos;s modules, quiz questions, restrictions, groups and completion rules from a
                file an earlier Export produced. Real files (a module&apos;s video/doc/SCORM package, the cover
                image, question images) aren&apos;t in the export — you&apos;ll re-upload those after. The course
                comes in as a new draft here.
              </p>
              <input
                ref={fileInputRef} type="file" accept="application/json,.json" className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
              />
              <button
                type="button" onClick={() => fileInputRef.current?.click()}
                className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-line px-4 py-6 text-xs text-ink-soft hover:border-primary"
              >
                <Upload className="h-4 w-4" /> {fileName ?? "Choose a .json export file"}
              </button>
              {parseError && <p className="text-xs text-danger">{parseError}</p>}
              {importCourse.isError && (
                <p className="text-xs text-danger">
                  {importCourse.error instanceof ApiError ? importCourse.error.message : "Couldn't import this file."}
                </p>
              )}
              <Button onClick={confirmImport} disabled={!parsed || importCourse.isPending}>
                {importCourse.isPending ? "Importing…" : "Import"}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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
            Start with just a title — you&apos;ll add modules, quizzes, completion rules and a cover image on the next
            screen. It starts as a draft (hidden from every learner, even once assigned) until you publish it.
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
  const [importOpen, setImportOpen] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [assigningCourseId, setAssigningCourseId] = useState<string | null>(null);
  const [bulkAssignIds, setBulkAssignIds] = useState<string[] | null>(null);

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
            <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-3.5 w-3.5" /> Import
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
          />
        ))}
        {shown?.length === 0 && <p className="text-sm text-ink-faint">No courses in this category yet.</p>}
      </div>

      <CreateCourseDialog open={createOpen} onOpenChange={setCreateOpen} />
      <ImportCourseDialog open={importOpen} onOpenChange={setImportOpen} />
      {assigningCourseId && <AssignModal courseId={assigningCourseId} onClose={() => setAssigningCourseId(null)} />}
      {bulkAssignIds && <AssignModal courseIds={bulkAssignIds} onClose={() => { setBulkAssignIds(null); clearSelection(); }} />}
    </div>
  );
}

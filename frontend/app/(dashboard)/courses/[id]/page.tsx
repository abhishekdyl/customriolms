"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Plus, ChevronUp, ChevronDown, Users, Award, Lock, BookOpen, Settings as SettingsIcon,
  BarChart3, MoreHorizontal, Trash2, Loader2, ImagePlus, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useCourse, useAddModule, useUpdateModule, useDeleteModule, useDeleteCourse, useReorderModules, useUpdateCourse,
  useEnrolledLearners, useUploadCourseCoverImage, useRemoveCourseCoverImage,
} from "@/lib/hooks/use-courses";
import { useCategories } from "@/lib/hooks/use-categories";
import { useBadges } from "@/lib/hooks/use-badges";
import { useCertTemplates } from "@/lib/hooks/use-cert-templates";
import { ModuleEditorRow, restrictionValid } from "@/components/shell/courses/module-editor";
import { AssignModal } from "@/components/shell/courses/assign-modal";
import { QuizAttemptsSection } from "@/components/shell/courses/quiz-attempts";
import { ModuleProgressMatrix } from "@/components/shell/courses/module-progress-matrix";
import { toQuestionInput } from "@/lib/quiz-utils";
import { cn, isoToLocal, localToIso, nowLocal } from "@/lib/utils";
import { MODULE_TYPE_LABEL } from "@/lib/learner-courses";
import type { Module } from "@/lib/types";

// Mirrors the learner-side course page's own tab bar (see
// (learner)/learn/courses/[id]/page.tsx) — everything that used to sit on
// one long scrolling page is now grouped under these:
//  - Course: the course's real working view — at-a-glance stats, the
//    completion-rule summary, the module list (add/reorder/edit/delete),
//    and the certificate/badge. Each section below is wrapped with its
//    own id + className (see the comments inline) so it can be targeted
//    directly — #course-section-stats, #course-section-completion,
//    #course-section-modules, #course-section-certificate.
//  - Settings: the course's own identity — name, description, category,
//    cover image, and the mandatory open/optional close dates.
//  - Participants: who's enrolled and their progress.
//  - Grades: the completion matrix + quiz/video-question grading.
//  - More: the Moodle-style completion-rules picker (which modules must
//    finish, ALL vs ANY, sequential unlock) and the delete-course danger
//    zone.
const TABS = [
  { id: "course", label: "Course", icon: BookOpen },
  { id: "settings", label: "Settings", icon: SettingsIcon },
  { id: "participants", label: "Participants", icon: Users },
  { id: "grades", label: "Grades", icon: BarChart3 },
  { id: "more", label: "More", icon: MoreHorizontal },
] as const;
type TabId = (typeof TABS)[number]["id"];

const isClosed = (closesAt: string | null) => !!closesAt && new Date(closesAt) < new Date();

export default function CourseManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: course, isLoading } = useCourse(id);
  const updateCourse = useUpdateCourse(id);
  const deleteCourse = useDeleteCourse();
  const addModule = useAddModule(id);
  const updateModuleMutation = useUpdateModule(id);
  const deleteModule = useDeleteModule(id);
  const reorder = useReorderModules(id);
  const uploadCover = useUploadCourseCoverImage(id);
  const removeCover = useRemoveCourseCoverImage(id);
  const { data: categories } = useCategories();
  const { data: badges } = useBadges();
  const { data: certTemplates } = useCertTemplates();
  const { data: enrolled, isLoading: enrolledLoading } = useEnrolledLearners(id);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<TabId>("course");
  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [assigning, setAssigning] = useState(false);

  // Local module state is the editor's working draft — every field edit
  // (including a brand-new module's) only lands here, never the server,
  // until that module's own "Save changes" button is clicked. dirtyIds
  // tracks which modules have edits not yet saved, purely for the
  // button's enabled/label state and the "Unsaved" badge.
  const [modules, setModules] = useState<Module[]>([]);
  const [dirtyIds, setDirtyIds] = useState<Set<string>>(new Set());
  const [savingId, setSavingId] = useState<string | null>(null);
  // Which modules had their "Visible to learners" switch explicitly
  // touched since the last save — only these get an explicit `published`
  // in the PATCH (see saveModule). A still-draft module the admin never
  // touches that switch on must stay omitted, so the backend's own
  // "any ordinary Save auto-publishes a draft" default (update_module)
  // is what makes it visible, not a value mirrored from its own
  // not-yet-published local state.
  const [publishOverrides, setPublishOverrides] = useState<Set<string>>(new Set());

  // A module with unsaved local edits must survive a background refetch
  // (an upload, a bank import, or another module's own save all
  // invalidate this course's query) — otherwise the explicit-save model
  // above is pointless, since any such action would silently discard
  // whatever the admin was mid-editing. For a dirty module, keep the
  // local draft and only pull in the fields a draft never actually
  // controls: file_url/file_name/file_size_label/scorm_launch_path/
  // scorm_version only ever change via the upload/remove/SCORM
  // mutations' own results, never via onChange, so refreshing
  // them from the server is always safe and is what lets an admin see a
  // video they just uploaded even while unrelated fields on the same
  // module are still unsaved. A bank-imported question landing on an
  // otherwise-dirty module is the one known gap this leaves — it won't
  // show until that module's edits are saved (or the page is reloaded).
  useEffect(() => {
    if (!course) return;
    setModules((prev) =>
      course.modules.map((serverMod) => {
        if (!dirtyIds.has(serverMod.id)) return serverMod;
        const draft = prev.find((p) => p.id === serverMod.id);
        if (!draft) return serverMod;
        return {
          ...draft,
          file_url: serverMod.file_url, file_name: serverMod.file_name,
          file_size_label: serverMod.file_size_label, scorm_launch_path: serverMod.scorm_launch_path,
          scorm_version: serverMod.scorm_version,
        };
      })
    );
  }, [course, dirtyIds]);

  if (isLoading || !course) return <div className="p-8 text-sm text-ink-faint">Loading…</div>;

  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= modules.length) return;
    const next = [...modules];
    [next[index], next[target]] = [next[target], next[index]];
    setModules(next);
    reorder.mutate(next.map((m) => m.id));
  };

  const patchModule = (moduleId: string, patch: Partial<Module>) => {
    setModules((prev) => prev.map((m) => (m.id === moduleId ? { ...m, ...patch } : m)));
    setDirtyIds((prev) => new Set(prev).add(moduleId));
    if ("published" in patch) setPublishOverrides((prev) => new Set(prev).add(moduleId));
  };

  const saveModule = (moduleId: string) => {
    const m = modules.find((mod) => mod.id === moduleId);
    if (!m) return;
    setSavingId(moduleId);
    // The editor works with the authoring/display shape (QuizQuestion —
    // what GET returns, with a server-assigned id and presigned
    // image_url); the PATCH endpoint expects QuestionIn (image_key only,
    // no id) — see quiz-utils.ts. Restrictions get the same
    // "incomplete entries never reach the server" filter the old
    // per-field debounce used to apply before sending, now applied once
    // here at actual save time instead.
    updateModuleMutation.mutate(
      {
        moduleId,
        title: m.title, type: m.type, required: m.required, threshold: m.threshold,
        video_question_min_correct: m.video_question_min_correct,
        retake_enabled: m.retake_enabled, retake_limit: m.retake_limit,
        instructions: m.instructions,
        skill_ids: m.skill_ids, badge_ids: m.badge_ids,
        certificate_enabled: m.certificate_enabled, certificate_template_id: m.certificate_template_id,
        certificate_name: m.certificate_name,
        questions: m.questions.map(toQuestionInput),
        restrictions: m.restrictions.filter(restrictionValid),
        // Omitted unless the admin actually touched the "Visible to
        // learners" switch this session — see publishOverrides above and
        // update_module's own auto-publish-on-save default.
        ...(publishOverrides.has(moduleId) ? { published: m.published } : {}),
      },
      {
        onSuccess: () => {
          setDirtyIds((prev) => { const next = new Set(prev); next.delete(moduleId); return next; });
          setPublishOverrides((prev) => { const next = new Set(prev); next.delete(moduleId); return next; });
        },
        onSettled: () => setSavingId(null),
      },
    );
  };

  const toggleCourseBadge = (badgeId: string) => {
    const next = course.badge_ids.includes(badgeId) ? course.badge_ids.filter((x) => x !== badgeId) : [...course.badge_ids, badgeId];
    updateCourse.mutate({ badge_ids: next });
  };

  return (
    <div className="p-8 max-w-3xl">
      <Link href="/courses" className="mb-5 inline-flex items-center gap-1.5 text-xs text-ink-soft">
        <ArrowLeft className="h-3.5 w-3.5" /> Courses
      </Link>

      <div className="mb-1">
        <h1 className="font-head text-xl text-ink">{course.title}</h1>
        <p className="text-[11px] text-ink-faint">Rename it, change its description, category or cover image under the Settings tab.</p>
      </div>

      {isClosed(course.closes_at) && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-danger">
          <Lock className="h-3.5 w-3.5" /> This course closed on {new Date(course.closes_at!).toLocaleDateString()} — no new assignments or learner progress.
        </p>
      )}

      <div className="mb-5 flex items-center gap-5 border-b border-line-soft">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 border-b-2 pb-2.5 pt-1",
              tab === t.id ? "border-primary" : "border-transparent"
            )}
          >
            <t.icon className="h-3.5 w-3.5" color={tab === t.id ? "var(--color-primary)" : "var(--color-ink-faint)"} />
            <span className={cn("text-[13px]", tab === t.id ? "font-medium text-ink" : "text-ink-faint")}>{t.label}</span>
          </button>
        ))}
      </div>

      {tab === "course" && (
        <div className="flex flex-col gap-6">
          {/* Section 1 — at-a-glance stats. */}
          <div id="course-section-stats" className="course-section course-section-stats grid grid-cols-3 gap-2.5">
            <div className="rounded-xl border border-line bg-surface p-3.5">
              <p className="text-[11px] text-ink-faint">Modules</p>
              <p className="font-head text-xl text-ink">{modules.length}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3.5">
              <p className="text-[11px] text-ink-faint">Enrolled learners</p>
              <p className="font-head text-xl text-ink">{enrolled?.length ?? 0}</p>
            </div>
            <div className="rounded-xl border border-line bg-surface p-3.5">
              <p className="text-[11px] text-ink-faint">Avg. progress</p>
              <p className="font-head text-xl text-ink">
                {enrolled && enrolled.length > 0
                  ? `${Math.round(enrolled.reduce((sum, e) => sum + e.progress_pct, 0) / enrolled.length)}%`
                  : "—"}
              </p>
            </div>
          </div>

          {/* Section 2 — completion-rule summary (full controls live under
              the Settings tab; this is just the current state at a glance). */}
          <div id="course-section-completion" className="course-section course-section-completion rounded-xl border border-line bg-surface p-4">
            <p className="mb-1 text-xs font-medium text-ink-faint">Course completes when…</p>
            <p className="text-[12.5px] text-ink">
              {course.completion_module_ids.length > 0
                ? `${course.completion_mode === "any" ? "Any one" : "All"} of ${course.completion_module_ids.length} selected module(s) ${course.completion_mode === "any" ? "is" : "are"} done`
                : "Every module in the course is done"}
              {course.sequential_unlock && " · modules unlock one at a time, in order"}
            </p>
            <p className="mt-1 text-[11px] text-ink-faint">Change this under the More tab.</p>
          </div>

          {/* Section 3 — the module list itself: add, reorder, edit, delete. */}
          <div id="course-section-modules" className="course-section course-section-modules">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-head text-sm text-ink">Modules ({modules.length})</span>
            </div>

            <div className="mb-4 flex flex-col gap-2">
              {modules.map((m, i) => (
                <div key={m.id} className="flex items-start gap-2">
                  <div className="flex flex-col gap-0.5 pt-3">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="disabled:opacity-30"><ChevronUp className="h-3.5 w-3.5 text-ink-faint" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === modules.length - 1} className="disabled:opacity-30"><ChevronDown className="h-3.5 w-3.5 text-ink-faint" /></button>
                  </div>
                  <div className="flex-1">
                    <ModuleEditorRow
                      courseId={id}
                      module={m}
                      allModules={modules}
                      onChange={(patch) => patchModule(m.id, patch)}
                      onDelete={() => { if (confirm("Remove this module?")) deleteModule.mutate(m.id); }}
                      isDirty={dirtyIds.has(m.id)}
                      saving={savingId === m.id}
                      onSave={() => saveModule(m.id)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); if (!newModuleTitle.trim()) return; addModule.mutate({ title: newModuleTitle.trim() }, { onSuccess: () => setNewModuleTitle("") }); }}
              className="flex gap-2"
            >
              <Input placeholder="New module title" value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} />
              <Button type="submit" disabled={addModule.isPending}><Plus className="h-4 w-4" /> Add module</Button>
            </form>
          </div>

          {/* Section 4 — certificate & badge. The course's real final step —
              it only shows up for a learner once every required module is
              done (see learn_service._finish_course_if_done). */}
          <div id="course-section-certificate" className="course-section course-section-certificate rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center gap-2">
              <Award className="h-4 w-4 text-amber" />
              <p className="text-xs font-medium text-ink-faint">Final step — certificate (optional)</p>
            </div>
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm text-ink">Issue a certificate when the course is completed</span>
              <Switch checked={course.certificate_enabled} onCheckedChange={(v) => updateCourse.mutate({ certificate_enabled: v })} />
            </div>
            {course.certificate_enabled && (
              <div className="mb-3 grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-[10.5px] text-ink-faint">Template</p>
                  <select
                    value={course.certificate_template_id ?? ""}
                    onChange={(e) => updateCourse.mutate({ certificate_template_id: e.target.value || null })}
                    className="w-full rounded-md border border-line px-2 py-1.5 text-xs"
                  >
                    <option value="">Select…</option>
                    {certTemplates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-[10.5px] text-ink-faint">Certification name</p>
                  <Input defaultValue={course.certificate_name ?? course.title} onBlur={(e) => updateCourse.mutate({ certificate_name: e.target.value })} className="h-7 text-xs" />
                </div>
              </div>
            )}
            <p className="mb-3 text-[11px] text-ink-faint">
              A learner only sees this on their Progress page once every required module is done — never before.
            </p>

            {(badges?.length ?? 0) > 0 && (
              <div className="border-t border-line-soft pt-3">
                <p className="mb-1.5 text-[11px] text-ink-soft">Badge on completing this course</p>
                <div className="flex flex-wrap gap-1.5">
                  {badges!.map((b) => {
                    const active = course.badge_ids.includes(b.id);
                    return (
                      <button
                        key={b.id}
                        onClick={() => toggleCourseBadge(b.id)}
                        className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px]"
                        style={{ borderColor: active ? b.color : "var(--color-line)", background: active ? `${b.color}1a` : "transparent", color: active ? b.color : undefined }}
                      >
                        <Award className="h-3 w-3" /> {b.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="mb-3 text-xs font-medium text-ink-faint">Course details</p>

            <div className="mb-3">
              <p className="mb-1 text-[10.5px] text-ink-faint">Course name</p>
              <Input defaultValue={course.title} onBlur={(e) => { if (e.target.value.trim()) updateCourse.mutate({ title: e.target.value.trim() }); }} />
            </div>

            <div className="mb-3">
              <p className="mb-1 text-[10.5px] text-ink-faint">Description</p>
              <textarea
                defaultValue={course.description ?? ""}
                onBlur={(e) => updateCourse.mutate({ description: e.target.value })}
                placeholder="What's this course about?"
                className="w-full resize-none rounded-lg border border-line bg-surface p-2.5 text-sm text-ink outline-none focus-visible:border-primary"
                rows={3}
              />
            </div>

            <div>
              <p className="mb-1 text-[10.5px] text-ink-faint">Category</p>
              <select
                value={course.category_id ?? ""}
                onChange={(e) => updateCourse.mutate({ category_id: e.target.value || null })}
                className="h-9 w-full rounded-lg border border-line bg-surface px-2.5 text-sm outline-none focus-visible:border-primary"
              >
                <option value="">No category</option>
                {categories?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="mb-3 text-xs font-medium text-ink-faint">Cover image</p>
            {course.cover_image_url ? (
              <div className="mb-3 flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={course.cover_image_url} alt="" className="h-20 w-32 rounded-lg border border-line object-cover" />
                <Button
                  variant="secondary" size="sm"
                  onClick={() => removeCover.mutate()}
                  disabled={removeCover.isPending}
                >
                  <X className="h-3.5 w-3.5" /> Remove
                </Button>
              </div>
            ) : (
              <p className="mb-3 text-[11px] text-ink-faint">No cover image yet — shown on the course card and preview.</p>
            )}
            <input
              ref={coverInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadCover.mutate(f); e.target.value = ""; }}
            />
            <Button variant="secondary" size="sm" onClick={() => coverInputRef.current?.click()} disabled={uploadCover.isPending}>
              {uploadCover.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
              {course.cover_image_url ? "Replace image" : "Upload image"}
            </Button>
          </div>

          <div className="rounded-xl border border-line bg-surface p-4">
            <p className="mb-3 text-xs font-medium text-ink-faint">Open / close dates</p>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <p className="mb-1 text-[10.5px] text-ink-faint">Opens / create date *</p>
                <input
                  type="datetime-local"
                  defaultValue={isoToLocal(course.opens_at) || nowLocal()}
                  min={nowLocal()}
                  onBlur={(e) => { if (e.target.value) updateCourse.mutate({ opens_at: localToIso(e.target.value) }); }}
                  className="h-8 w-full rounded-md border border-line bg-surface px-2 text-xs outline-none focus-visible:border-primary"
                />
              </div>
              <div>
                <p className="mb-1 text-[10.5px] text-ink-faint">Closes (optional)</p>
                <input
                  type="datetime-local"
                  defaultValue={isoToLocal(course.closes_at)}
                  min={nowLocal()}
                  onBlur={(e) => updateCourse.mutate({ closes_at: e.target.value ? localToIso(e.target.value) : null })}
                  className="h-8 w-full rounded-md border border-line bg-surface px-2 text-xs outline-none focus-visible:border-primary"
                />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-faint">
              The open date can&apos;t be in the past, and a close date (if set) must be later than it.
            </p>
          </div>
        </div>
      )}

      {tab === "participants" && (
        <div className="rounded-xl border border-line bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-xs font-medium text-ink-faint">
              Enrolled learners {enrolled ? `(${enrolled.length})` : ""}
            </p>
            <Button size="sm" variant="secondary" onClick={() => setAssigning(true)}>
              <Users className="h-3.5 w-3.5" /> Assign ({course.assigned_team_count} teams)
            </Button>
          </div>
          {enrolledLoading && <p className="text-xs text-ink-faint">Loading…</p>}
          {!enrolledLoading && (enrolled?.length ?? 0) === 0 && (
            <p className="text-xs text-ink-faint">No one's enrolled yet — assign a team or a learner above.</p>
          )}
          {(enrolled?.length ?? 0) > 0 && (
            <div className="flex flex-col divide-y divide-line-soft">
              {enrolled!.map((e) => (
                <div key={e.user_id} className="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-ink">{e.name}</p>
                    <p className="truncate text-[11px] text-ink-faint">
                      {e.email} · {e.via === "team" ? (e.team_name ?? "via team") : "assigned directly"}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <span className="text-xs text-ink-soft">{e.progress_pct}%</span>
                    {e.completed && (
                      <span className="rounded-full bg-success-soft px-2 py-0.5 text-[10.5px] text-success">Done</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "grades" && (
        <div>
          <ModuleProgressMatrix courseId={id} />
          <QuizAttemptsSection courseId={id} />
        </div>
      )}

      {tab === "more" && (
        <div className="flex flex-col gap-6">
          <div className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-medium text-ink-faint">Course completion rules</p>
              {modules.length > 0 && (
                <button
                  onClick={() => updateCourse.mutate({
                    completion_module_ids: course.completion_module_ids.length === modules.length ? [] : modules.map((m) => m.id),
                  })}
                  className="text-[11px] text-primary"
                >
                  {course.completion_module_ids.length === modules.length ? "Select none" : "Select all"}
                </button>
              )}
            </div>

            <p className="mb-1.5 text-[10.5px] text-ink-faint">
              Condition: Activity completion — choose which modules the course completes on.
            </p>
            {modules.length === 0 && <p className="text-xs text-ink-faint">Add modules under the Course tab first.</p>}
            <div className="mb-3 flex flex-col gap-1.5">
              {modules.map((m) => {
                const checked = course.completion_module_ids.includes(m.id);
                return (
                  <label key={m.id} className="flex items-center gap-2 text-xs text-ink-soft">
                    <input
                      type="checkbox" checked={checked}
                      onChange={() => {
                        const next = checked
                          ? course.completion_module_ids.filter((x) => x !== m.id)
                          : [...course.completion_module_ids, m.id];
                        updateCourse.mutate({ completion_module_ids: next });
                      }}
                    />
                    {MODULE_TYPE_LABEL[m.type as keyof typeof MODULE_TYPE_LABEL] ?? m.type} - {m.title}
                  </label>
                );
              })}
            </div>
            <p className="mb-3 text-[11px] text-ink-faint">
              Leaving every module unchecked means the course completes once all of them are done.
            </p>

            {course.completion_module_ids.length > 0 && (
              <div className="mb-3 flex items-center gap-2 border-t border-line-soft pt-3">
                <p className="text-xs text-ink">Condition requires:</p>
                <select
                  value={course.completion_mode}
                  onChange={(e) => updateCourse.mutate({ completion_mode: e.target.value as "all" | "any" })}
                  className="h-8 rounded-md border border-line bg-surface px-2 text-xs outline-none focus-visible:border-primary"
                >
                  <option value="all">ALL selected modules to be completed</option>
                  <option value="any">ANY selected module to be completed</option>
                </select>
              </div>
            )}

            <div className="flex items-center justify-between border-t border-line-soft pt-3">
              <div>
                <span className="text-sm text-ink">Lock modules in order</span>
                <p className="text-[11px] text-ink-faint">A learner must finish each module before the next one (by the order under the Course tab) unlocks.</p>
              </div>
              <Switch checked={course.sequential_unlock} onCheckedChange={(v) => updateCourse.mutate({ sequential_unlock: v })} />
            </div>
          </div>

          <div className="rounded-xl border border-danger/30 bg-surface p-4">
            <p className="mb-1 text-xs font-medium text-danger">Danger zone</p>
            <p className="mb-3 text-[11.5px] text-ink-faint">
              Deleting a course removes it for every assigned learner — their progress, attempts, and certificates on
              it are gone too. This can't be undone.
            </p>
            <Button
              variant="secondary"
              onClick={() => {
                if (!confirm(`Delete "${course.title}" permanently? This can't be undone.`)) return;
                deleteCourse.mutate(course.id, { onSuccess: () => router.push("/courses") });
              }}
              disabled={deleteCourse.isPending}
              className="border-danger/40 text-danger hover:bg-danger-soft"
            >
              {deleteCourse.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              Delete course
            </Button>
          </div>
        </div>
      )}

      {assigning && <AssignModal courseId={id} onClose={() => setAssigning(false)} />}
    </div>
  );
}

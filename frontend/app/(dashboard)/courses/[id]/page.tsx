"use client";
import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Plus, ChevronUp, ChevronDown, Users, Award, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  useCourse, useAddModule, useUpdateModule, useDeleteModule, useReorderModules, useUpdateCourse,
  useEnrolledLearners,
} from "@/lib/hooks/use-courses";
import { useBadges } from "@/lib/hooks/use-badges";
import { useCertTemplates } from "@/lib/hooks/use-cert-templates";
import { ModuleEditorRow } from "@/components/shell/courses/module-editor";
import { AssignModal } from "@/components/shell/courses/assign-modal";
import { QuizAttemptsSection } from "@/components/shell/courses/quiz-attempts";
import { ModuleProgressMatrix } from "@/components/shell/courses/module-progress-matrix";
import { toQuestionInput } from "@/lib/quiz-utils";
import type { Module } from "@/lib/types";

// "2026-03-01T00:00:00+00:00" -> "2026-03-01", for a <input type="date"> value.
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

const isClosed = (closesAt: string | null) => !!closesAt && new Date(closesAt) < new Date();

export default function CourseManagePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { data: course, isLoading } = useCourse(id);
  const updateCourse = useUpdateCourse(id);
  const addModule = useAddModule(id);
  const updateModuleMutation = useUpdateModule(id);
  const deleteModule = useDeleteModule(id);
  const reorder = useReorderModules(id);
  const { data: badges } = useBadges();
  const { data: certTemplates } = useCertTemplates();
  const { data: enrolled, isLoading: enrolledLoading } = useEnrolledLearners(id);

  const [newModuleTitle, setNewModuleTitle] = useState("");
  const [titleDraft, setTitleDraft] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  // Local module state lets typing feel instant; each field's change is
  // pushed to the server on a short debounce instead of on every
  // keystroke, so a title edit doesn't fire a PATCH per letter.
  const [modules, setModules] = useState<Module[]>([]);
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    if (course) setModules(course.modules);
  }, [course]);

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

    clearTimeout(debounceTimers.current[moduleId]);
    debounceTimers.current[moduleId] = setTimeout(() => {
      // The editor works with the authoring/display shape (QuizQuestion —
      // what GET returns, with a server-assigned id and presigned
      // image_url); the PATCH endpoint expects QuestionIn (image_key
      // only, no id) — see quiz-utils.ts for why.
      const { questions, ...rest } = patch;
      updateModuleMutation.mutate({
        moduleId, ...rest,
        ...(questions ? { questions: questions.map(toQuestionInput) } : {}),
      });
    }, 400);
  };

  const toggleCourseBadge = (badgeId: string) => {
    const next = course.badge_ids.includes(badgeId) ? course.badge_ids.filter((x) => x !== badgeId) : [...course.badge_ids, badgeId];
    updateCourse.mutate({ badge_ids: next });
  };

  return (
    <div className="p-8 max-w-2xl">
      <Link href="/courses" className="mb-5 inline-flex items-center gap-1.5 text-xs text-ink-soft">
        <ArrowLeft className="h-3.5 w-3.5" /> Courses
      </Link>

      <div className="mb-1 flex items-center justify-between gap-3">
        {titleDraft !== null ? (
          <Input
            value={titleDraft} autoFocus
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => { updateCourse.mutate({ title: titleDraft }); setTitleDraft(null); }}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            className="font-head text-xl h-auto py-1"
          />
        ) : (
          <h1 onClick={() => setTitleDraft(course.title)} className="font-head text-xl text-ink cursor-text">{course.title}</h1>
        )}
        <Button size="sm" variant="secondary" onClick={() => setAssigning(true)} className="flex-shrink-0">
          <Users className="h-3.5 w-3.5" /> Assign ({course.assigned_team_count} teams)
        </Button>
      </div>

      {isClosed(course.closes_at) && (
        <p className="mb-3 flex items-center gap-1.5 text-xs text-danger">
          <Lock className="h-3.5 w-3.5" /> This course closed on {new Date(course.closes_at!).toLocaleDateString()} — no new assignments or learner progress.
        </p>
      )}

      <textarea
        defaultValue={course.description ?? ""}
        onBlur={(e) => updateCourse.mutate({ description: e.target.value })}
        placeholder="What's this course about?"
        className="mb-6 w-full resize-none rounded-lg border border-transparent px-0 text-sm text-ink-faint outline-none hover:border-line-soft focus:border-line"
        rows={1}
      />

      <div className="mb-6 rounded-xl border border-line bg-surface p-4">
        <p className="mb-3 text-xs font-medium text-ink-faint">Open / close dates</p>
        <div className="mb-4 grid grid-cols-2 gap-2.5">
          <div>
            <p className="mb-1 text-[10.5px] text-ink-faint">Opens (optional)</p>
            <input
              type="date"
              defaultValue={toDateInputValue(course.opens_at)}
              onBlur={(e) => updateCourse.mutate({ opens_at: e.target.value || null })}
              className="h-8 w-full rounded-md border border-line bg-surface px-2 text-xs outline-none focus-visible:border-primary"
            />
          </div>
          <div>
            <p className="mb-1 text-[10.5px] text-ink-faint">Closes (optional)</p>
            <input
              type="date"
              defaultValue={toDateInputValue(course.closes_at)}
              onBlur={(e) => updateCourse.mutate({ closes_at: e.target.value || null })}
              className="h-8 w-full rounded-md border border-line bg-surface px-2 text-xs outline-none focus-visible:border-primary"
            />
          </div>
        </div>

      </div>

      <div className="mb-6 rounded-xl border border-line bg-surface p-4">
        <p className="mb-3 text-xs font-medium text-ink-faint">
          Enrolled learners {enrolled ? `(${enrolled.length})` : ""}
        </p>
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

      <ModuleProgressMatrix courseId={id} />

      <QuizAttemptsSection courseId={id} />

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
                onChange={(patch) => patchModule(m.id, patch)}
                onDelete={() => { if (confirm("Remove this module?")) deleteModule.mutate(m.id); }}
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

      {/* Certificate is the course's real final step — it only shows up for
          a learner once every required module above is done (see
          learn_service._finish_course_if_done), so it's positioned here,
          after the module list, rather than up with the other settings. */}
      <div className="mt-6 rounded-xl border border-line bg-surface p-4">
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
          A learner only sees this on their Progress page once every required module above is done — never before.
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

      {assigning && <AssignModal courseId={id} onClose={() => setAssigning(false)} />}
    </div>
  );
}

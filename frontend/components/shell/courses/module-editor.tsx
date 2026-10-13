"use client";
import { useState } from "react";
import { ChevronDown, CheckCircle2, Circle, Trash2, Plus, Upload, X, Award } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSkills } from "@/lib/hooks/use-skills";
import { useBadges } from "@/lib/hooks/use-badges";
import { useCertTemplates } from "@/lib/hooks/use-cert-templates";
import type { Module, ModuleType, QuizQuestion } from "@/lib/types";

const moduleTypeLabel: Record<ModuleType, string> = {
  watch: "Watch video", quiz: "Pass quiz", read: "Read & acknowledge", manual: "Manual sign-off",
};

function moduleSummary(m: Module) {
  if (m.type === "watch") return `Watch ≥${m.threshold}%`;
  if (m.type === "quiz") return `Quiz ≥${m.threshold}%`;
  if (m.type === "read") return "Marked as read";
  return "Instructor sign-off";
}

// Content isn't actually uploaded to a server yet (no file-storage backend
// wired up) — this just records the file's name/size the way the
// prototype does, as a placeholder for real storage later.
function FileMetaField({
  fileName, fileSizeLabel, accept, label, onSet, onRemove,
}: {
  fileName: string | null; fileSizeLabel: string | null; accept: string; label: string;
  onSet: (name: string, sizeLabel: string) => void; onRemove: () => void;
}) {
  if (fileName) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5">
        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-ink">{fileName}</div>
          {fileSizeLabel && <div className="text-[10px] text-ink-faint">{fileSizeLabel}</div>}
        </div>
        <button onClick={onRemove} className="flex-shrink-0"><X className="h-3.5 w-3.5 text-ink-faint" /></button>
      </div>
    );
  }
  return (
    <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line py-3">
      <Upload className="h-3.5 w-3.5 text-ink-faint" />
      <span className="text-xs text-ink-soft">{label}</span>
      <input
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSet(f.name, `${(f.size / 1_000_000).toFixed(1)} MB`);
        }}
      />
    </label>
  );
}

function QuizBuilder({ questions, onChange }: { questions: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void }) {
  const addQuestion = () =>
    onChange([...questions, { id: `new-${Date.now()}`, text: "New question", options: ["Option A", "Option B"], correct_index: 0 }]);
  const updateQ = (id: string, next: QuizQuestion) => onChange(questions.map((q) => (q.id === id ? next : q)));
  const deleteQ = (id: string) => onChange(questions.filter((q) => q.id !== id));

  return (
    <div className="flex flex-col gap-2.5">
      {questions.map((q) => (
        <div key={q.id} className="rounded-lg border border-line-soft bg-paper p-3">
          <div className="mb-2 flex items-start gap-2">
            <Input value={q.text} onChange={(e) => updateQ(q.id, { ...q, text: e.target.value })} className="h-8 flex-1 text-sm" />
            <button onClick={() => deleteQ(q.id)}><Trash2 className="h-3.5 w-3.5 text-danger" /></button>
          </div>
          {q.options.map((opt, oi) => (
            <div key={oi} className="mb-1 flex items-center gap-2">
              <button onClick={() => updateQ(q.id, { ...q, correct_index: oi })} className="flex-shrink-0">
                {oi === q.correct_index ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Circle className="h-3.5 w-3.5 text-ink-faint" />}
              </button>
              <input
                value={opt}
                onChange={(e) => updateQ(q.id, { ...q, options: q.options.map((o, i) => (i === oi ? e.target.value : o)) })}
                className="flex-1 border-b border-line-soft bg-transparent py-0.5 text-xs outline-none"
              />
              {q.options.length > 2 && (
                <button onClick={() => updateQ(q.id, { ...q, options: q.options.filter((_, i) => i !== oi), correct_index: q.correct_index === oi ? 0 : q.correct_index })}>
                  <X className="h-3 w-3 text-ink-faint" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={() => updateQ(q.id, { ...q, options: [...q.options, `Option ${String.fromCharCode(65 + q.options.length)}`] })}
            className="mt-1 text-[11px] text-primary"
          >
            + Add option
          </button>
        </div>
      ))}
      <button onClick={addQuestion} className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2">
        <Plus className="h-3 w-3 text-primary" /> <span className="text-xs font-medium text-primary">Add question</span>
      </button>
    </div>
  );
}

export function ModuleEditorRow({
  module: m,
  onChange,
  onDelete,
}: {
  module: Module;
  onChange: (patch: Partial<Module>) => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: skills } = useSkills();
  const { data: badges } = useBadges();
  const { data: certTemplates } = useCertTemplates();

  const hasContent = m.type === "manual" ? !!m.instructions : m.type === "quiz" ? m.questions.length > 0 : !!m.file_name;

  const toggleSkill = (id: string) =>
    onChange({ skill_ids: m.skill_ids.includes(id) ? m.skill_ids.filter((x) => x !== id) : [...m.skill_ids, id] });
  const toggleBadge = (id: string) =>
    onChange({ badge_ids: m.badge_ids.includes(id) ? m.badge_ids.filter((x) => x !== id) : [...m.badge_ids, id] });

  return (
    <div className="mb-2 rounded-lg border border-line bg-surface">
      <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-medium text-ink">{m.title}</div>
          <div className="text-xs text-ink-faint">
            {moduleSummary(m)}{!m.required && " · Optional"}
            {m.skill_ids.length > 0 && ` · ${m.skill_ids.length} skill${m.skill_ids.length > 1 ? "s" : ""}`}
            {m.badge_ids.length > 0 && ` · ${m.badge_ids.length} badge${m.badge_ids.length > 1 ? "s" : ""}`}
            {m.certificate_enabled && " · certificate"}
          </div>
        </div>
        {m.certificate_enabled && <Award className="h-3.5 w-3.5 flex-shrink-0 text-amber" />}
        {hasContent ? (
          <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success" />
        ) : (
          <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-amber-soft px-2 py-0.5 text-[10px] text-amber">No content</span>
        )}
        <ChevronDown className={`h-4 w-4 flex-shrink-0 text-ink-faint transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line-soft px-4 pb-4 pt-3.5">
          <div>
            <p className="mb-1 text-[11px] text-ink-soft">Module title</p>
            <Input value={m.title} onChange={(e) => onChange({ title: e.target.value })} className="h-9 text-sm" />
          </div>

          {(skills?.length ?? 0) > 0 && (
            <div>
              <p className="mb-1.5 text-[11px] text-ink-soft">Skills this module builds</p>
              <div className="flex flex-wrap gap-1.5">
                {skills!.map((s) => {
                  const active = m.skill_ids.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => toggleSkill(s.id)}
                      className={`rounded-full border px-2.5 py-1 text-[11.5px] ${active ? "border-primary bg-primary-soft text-primary font-medium" : "border-line text-ink-soft"}`}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-soft">Counts as complete when</span>
            <select
              value={m.type}
              onChange={(e) => onChange({ type: e.target.value as ModuleType })}
              className="rounded-md border border-line px-2 py-1 text-xs"
            >
              {Object.entries(moduleTypeLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] text-ink-soft">Content</p>
            {m.type === "watch" && (
              <FileMetaField label="Upload video" accept="video/*" fileName={m.file_name} fileSizeLabel={m.file_size_label}
                onSet={(name, size) => onChange({ file_name: name, file_size_label: size })}
                onRemove={() => onChange({ file_name: null, file_size_label: null })} />
            )}
            {m.type === "read" && (
              <FileMetaField label="Upload document (PDF/DOC)" accept=".pdf,.doc,.docx" fileName={m.file_name} fileSizeLabel={m.file_size_label}
                onSet={(name, size) => onChange({ file_name: name, file_size_label: size })}
                onRemove={() => onChange({ file_name: null, file_size_label: null })} />
            )}
            {m.type === "quiz" && <QuizBuilder questions={m.questions} onChange={(qs) => onChange({ questions: qs })} />}
            {m.type === "manual" && (
              <textarea
                value={m.instructions ?? ""}
                onChange={(e) => onChange({ instructions: e.target.value })}
                placeholder="What should the instructor verify before marking this complete?"
                className="min-h-16 w-full rounded-lg border border-line px-2.5 py-2 text-xs outline-none"
              />
            )}
          </div>

          {(m.type === "watch" || m.type === "quiz") && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-soft">{m.type === "watch" ? "Minimum watched" : "Minimum score"}</span>
              <div className="flex items-center gap-2">
                <input type="range" min={50} max={100} step={5} value={m.threshold} onChange={(e) => onChange({ threshold: Number(e.target.value) })} className="w-24 accent-primary" />
                <span className="w-9 text-right text-xs text-ink">{m.threshold}%</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-soft">Required for course completion</span>
            <Switch checked={m.required} onCheckedChange={(v) => onChange({ required: v })} />
          </div>

          {(badges?.length ?? 0) > 0 && (
            <div className="border-t border-line-soft pt-3">
              <p className="mb-1.5 text-[11px] text-ink-soft">Badge on completing this module</p>
              <div className="flex flex-wrap gap-1.5">
                {badges!.map((b) => {
                  const active = m.badge_ids.includes(b.id);
                  return (
                    <button
                      key={b.id}
                      onClick={() => toggleBadge(b.id)}
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

          <div className="border-t border-line-soft pt-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs text-ink-soft">Certificate for this module</span>
              <Switch checked={m.certificate_enabled} onCheckedChange={(v) => onChange({ certificate_enabled: v })} />
            </div>
            {m.certificate_enabled && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="mb-1 text-[10.5px] text-ink-faint">Template</p>
                  <select
                    value={m.certificate_template_id ?? ""}
                    onChange={(e) => onChange({ certificate_template_id: e.target.value || null })}
                    className="w-full rounded-md border border-line px-2 py-1 text-xs"
                  >
                    <option value="">Select…</option>
                    {certTemplates?.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <p className="mb-1 text-[10.5px] text-ink-faint">Certification name</p>
                  <Input value={m.certificate_name ?? m.title} onChange={(e) => onChange({ certificate_name: e.target.value })} className="h-7 text-xs" />
                </div>
              </div>
            )}
          </div>

          <button onClick={onDelete} className="mt-1 flex items-center gap-1.5 self-start">
            <Trash2 className="h-3 w-3 text-danger" /> <span className="text-[11.5px] text-danger">Remove module</span>
          </button>
        </div>
      )}
    </div>
  );
}

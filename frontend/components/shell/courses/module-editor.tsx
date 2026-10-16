"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronDown, CheckCircle2, Circle, Trash2, Plus, Upload, X, Award, Loader2, Image as ImageIcon, Library } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useSkills } from "@/lib/hooks/use-skills";
import { useBadges } from "@/lib/hooks/use-badges";
import { useCertTemplates } from "@/lib/hooks/use-cert-templates";
import { useUploadModuleFile, useRemoveModuleFile, useUploadScormPackage } from "@/lib/hooks/use-courses";
import { useQuestionBanks, useQuestionBank, useImportBankQuestions, useUploadQuestionImage } from "@/lib/hooks/use-question-banks";
import { newQuestion, tempId } from "@/lib/quiz-utils";
import { ApiError } from "@/lib/api-client";
import type { Module, ModuleRestriction, ModuleType, QuestionType, QuizQuestion } from "@/lib/types";

const moduleTypeLabel: Record<ModuleType, string> = {
  watch: "Watch video", quiz: "Pass quiz", read: "Read & acknowledge", manual: "Manual sign-off", scorm: "SCORM package",
};

function moduleSummary(m: Module) {
  if (m.type === "watch") return `Watch ≥${m.threshold}%`;
  if (m.type === "quiz") return `Quiz ≥${m.threshold}%`;
  if (m.type === "read") return "Marked as read";
  if (m.type === "scorm") return m.scorm_version ? `SCORM ${m.scorm_version}` : "SCORM package";
  return "Instructor sign-off";
}

// Uploads straight to object storage (R2) through the backend's upload
// endpoint — the module's file_name/file_size_label/file_url come back
// real once the upload succeeds, rather than being guessed client-side.
function FileMetaField({
  courseId, moduleId, fileName, fileSizeLabel, fileUrl, accept, label,
}: {
  courseId: string; moduleId: string; fileName: string | null; fileSizeLabel: string | null;
  fileUrl: string | null; accept: string; label: string;
}) {
  const upload = useUploadModuleFile(courseId);
  const remove = useRemoveModuleFile(courseId);
  const [error, setError] = useState<string | null>(null);

  if (upload.isPending) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5">
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-ink-faint" />
        <span className="text-xs text-ink-soft">Uploading…</span>
      </div>
    );
  }

  if (fileName) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5">
        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          {fileUrl ? (
            <a href={fileUrl} target="_blank" rel="noreferrer" className="truncate text-xs text-ink underline">{fileName}</a>
          ) : (
            <div className="truncate text-xs text-ink">{fileName}</div>
          )}
          {fileSizeLabel && <div className="text-[10px] text-ink-faint">{fileSizeLabel}</div>}
        </div>
        <button onClick={() => remove.mutate(moduleId)} disabled={remove.isPending} className="flex-shrink-0">
          <X className="h-3.5 w-3.5 text-ink-faint" />
        </button>
      </div>
    );
  }
  return (
    <div>
      <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line py-3">
        <Upload className="h-3.5 w-3.5 text-ink-faint" />
        <span className="text-xs text-ink-soft">{label}</span>
        <input
          type="file"
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError(null);
            upload.mutate({ moduleId, file: f }, {
              onError: (err) => setError(err instanceof ApiError ? err.message : "Upload failed."),
            });
          }}
        />
      </label>
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

// Same shape of control as FileMetaField, but for a SCORM .zip — the
// response carries scorm_launch_path/scorm_version once the backend has
// unpacked it and parsed imsmanifest.xml, not just a filename.
function ScormUploadField({
  courseId, moduleId, fileName, fileSizeLabel, scormVersion, onRemove,
}: {
  courseId: string; moduleId: string; fileName: string | null; fileSizeLabel: string | null;
  scormVersion: string | null; onRemove: () => void;
}) {
  const upload = useUploadScormPackage(courseId);
  const [error, setError] = useState<string | null>(null);

  if (upload.isPending) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-line px-3 py-2.5">
        <Loader2 className="h-3.5 w-3.5 flex-shrink-0 animate-spin text-ink-faint" />
        <span className="text-xs text-ink-soft">Unpacking package…</span>
      </div>
    );
  }

  if (fileName) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5">
        <CheckCircle2 className="h-3.5 w-3.5 flex-shrink-0 text-success" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs text-ink">{fileName}</div>
          <div className="text-[10px] text-ink-faint">
            SCORM {scormVersion ?? "1.2"}{fileSizeLabel && ` · ${fileSizeLabel}`}
          </div>
        </div>
        <button onClick={onRemove} className="flex-shrink-0"><X className="h-3.5 w-3.5 text-ink-faint" /></button>
      </div>
    );
  }
  return (
    <div>
      <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-line py-3">
        <Upload className="h-3.5 w-3.5 text-ink-faint" />
        <span className="text-xs text-ink-soft">Upload SCORM package (.zip)</span>
        <input
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError(null);
            upload.mutate({ moduleId, file: f }, {
              onError: (err) => setError(err instanceof ApiError ? err.message : "Upload failed."),
            });
          }}
        />
      </label>
      {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
    </div>
  );
}

const questionTypeLabel: Record<QuestionType, string> = {
  mcq: "Multiple choice", true_false: "True / False", short_answer: "Short answer",
};

// Small inline image upload/preview, shared by a question's own image and
// each of its MCQ/TRUE_FALSE options — a "picture quiz" question/option is
// just one of these with no text, not a different shape (see
// backend/app/schemas/question.py).
function ImagePicker({ imageUrl, onUploaded, onRemove, size = "h-16 w-16" }: {
  imageUrl: string | null; onUploaded: (key: string, url: string | null) => void; onRemove: () => void; size?: string;
}) {
  const upload = useUploadQuestionImage();
  const [error, setError] = useState<string | null>(null);

  if (upload.isPending) {
    return <div className={`flex ${size} flex-shrink-0 items-center justify-center rounded-lg border border-dashed border-line`}><Loader2 className="h-3.5 w-3.5 animate-spin text-ink-faint" /></div>;
  }
  if (imageUrl) {
    return (
      <div className={`relative ${size} flex-shrink-0 overflow-hidden rounded-lg border border-line-soft`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="" className="h-full w-full object-cover" />
        <button onClick={onRemove} className="absolute right-0.5 top-0.5 rounded-full bg-paper/90 p-0.5">
          <X className="h-3 w-3 text-ink-faint" />
        </button>
      </div>
    );
  }
  return (
    <div className={`flex-shrink-0 ${size}`}>
      <label className={`flex ${size} cursor-pointer items-center justify-center rounded-lg border border-dashed border-line`}>
        <ImageIcon className="h-3.5 w-3.5 text-ink-faint" />
        <input
          type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setError(null);
            upload.mutate(f, {
              onSuccess: (res) => onUploaded(res.image_key, res.image_url),
              onError: (err) => setError(err instanceof ApiError ? err.message : "Upload failed."),
            });
          }}
        />
      </label>
      {error && <p className="mt-0.5 max-w-16 text-[9px] text-danger">{error}</p>}
    </div>
  );
}

/** A bank question carrying an image anywhere (its own or an option's) —
 * used by BankImportPicker's excludePictureQuestions to hide these from
 * a WATCH module's import list entirely, rather than let the admin pick
 * one and hit the backend's rejection on import. */
function isPictureQuestion(q: { image_key: string | null; options: { image_key?: string | null }[] }): boolean {
  return !!q.image_key || q.options.some((o) => !!o.image_key);
}

function BankImportPicker({
  courseId, moduleId, onDone, excludePictureQuestions = false, onImported,
}: {
  courseId: string; moduleId: string; onDone: () => void; excludePictureQuestions?: boolean;
  // Called with the server's fresh copy of the module right after a
  // successful import, before onDone closes the panel — lets the caller
  // merge the newly-imported question(s) into its own local draft
  // without losing any of that draft's other unsaved edits (see
  // WatchQuestionsBuilder/QuizBuilder's own onChange wiring, which is
  // what the admin's edits actually flow through — this module stays
  // unsaved server-side until that module's own "Save changes" fires).
  onImported?: (module: Module) => void;
}) {
  const { data: banks } = useQuestionBanks();
  const [bankId, setBankId] = useState<string>("");
  const { data: bank } = useQuestionBank(bankId || null);
  const [selected, setSelected] = useState<string[]>([]);
  const importQs = useImportBankQuestions(courseId);

  const allQuestions = bank?.questions ?? [];
  const pictureCount = excludePictureQuestions ? allQuestions.filter(isPictureQuestion).length : 0;
  const importable = excludePictureQuestions ? allQuestions.filter((q) => !isPictureQuestion(q)) : allQuestions;

  return (
    <div className="rounded-lg border border-line-soft bg-paper p-3">
      <select value={bankId} onChange={(e) => { setBankId(e.target.value); setSelected([]); }} className="w-full rounded-md border border-line px-2 py-1.5 text-xs">
        <option value="">Choose a question bank…</option>
        {banks?.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.question_count})</option>)}
      </select>
      {bank && (
        <div className="mt-2 flex flex-col gap-1">
          {allQuestions.length === 0 && <p className="text-[11px] text-ink-faint">This bank has no questions yet.</p>}
          {pictureCount > 0 && (
            <p className="text-[10.5px] text-ink-faint">
              {pictureCount} picture question{pictureCount > 1 ? "s" : ""} hidden — not supported in-video.
            </p>
          )}
          {importable.map((q) => (
            <label key={q.id} className="flex items-start gap-2 rounded-md px-1.5 py-1 text-xs hover:bg-surface">
              <input
                type="checkbox" className="mt-0.5"
                checked={selected.includes(q.id)}
                onChange={(e) => setSelected(e.target.checked ? [...selected, q.id] : selected.filter((x) => x !== q.id))}
              />
              <span className="flex-1">
                <span className="text-ink">{q.text || "(image question)"}</span>
                <span className="ml-1.5 text-[10px] text-ink-faint">{questionTypeLabel[q.type]}</span>
              </span>
            </label>
          ))}
          {importable.length > 0 && (
            <button
              disabled={selected.length === 0 || importQs.isPending}
              onClick={() => importQs.mutate({ bankId, moduleId, questionIds: selected }, {
                onSuccess: (mod) => { onImported?.(mod); onDone(); },
              })}
              className="mt-1 w-full rounded-md bg-primary py-1.5 text-[11px] font-medium text-white disabled:opacity-40"
            >
              {importQs.isPending ? "Importing…" : `Import ${selected.length || ""} question${selected.length === 1 ? "" : "s"}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// mm:ss display for a seconds value — used by the video-duration-aware
// "Shows at" slider below (and the duration readout above it).
function formatClock(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** Merges a bank import's fresh server response into the local
 * (possibly unsaved-edited) question list: an id already present locally
 * keeps its local version — preserving whatever the admin was mid-editing
 * (a trigger time, a timer) — while a brand-new id (the just-imported
 * question) is taken from the server as-is. Used by both QuizBuilder and
 * WatchQuestionsBuilder's BankImportPicker#onImported, since import can
 * land on a module that already has unsaved edits sitting in its draft. */
function mergeImportedQuestions(local: QuizQuestion[], serverQuestions: QuizQuestion[]): QuizQuestion[] {
  const localById = new Map(local.map((q) => [q.id, q]));
  return serverQuestions.map((serverQ) => localById.get(serverQ.id) ?? serverQ);
}

export function QuestionCard({
  q, onChange, onDelete, showImagePicker = true, showTiming = false, videoDurationSec = null,
  isCustomTiming = false, onToggleCustomTiming, defaultTimerSeconds = null, defaultPoints = 1,
}: {
  q: QuizQuestion; onChange: (next: QuizQuestion) => void; onDelete: () => void;
  // false for a WATCH module's in-video questions — picture questions
  // aren't allowed mid-video (backend rejects image_key there), so the
  // picker is hidden entirely rather than left to fail on save.
  showImagePicker?: boolean;
  // true for a WATCH module's in-video questions — renders the
  // trigger-time row below, plus a "custom timer & marks" toggle (see
  // isCustomTiming) — by default every question follows
  // WatchQuestionsBuilder's module-wide defaults, but this lets a
  // particular question opt out and get its own timer/points instead.
  showTiming?: boolean;
  // The uploaded video's real length, read client-side once its metadata
  // loads (see ModuleEditorRow) — turns "Shows at" into a duration-aware
  // slider instead of a blind number the admin has to guess at. Null
  // before the video's loaded (or if there's no video yet), in which
  // case a plain number input is the fallback.
  videoDurationSec?: number | null;
  // Whether this specific question has opted out of the module-wide
  // timer/points defaults — only meaningful when showTiming is true.
  // When false, q.timer_seconds/q.points are kept in lockstep with the
  // defaults by WatchQuestionsBuilder, so this card just displays them
  // read-only; when true, this card's own inputs edit them directly.
  isCustomTiming?: boolean;
  onToggleCustomTiming?: () => void;
  // The module's current defaults — shown read-only here when this
  // question isn't customized, so the admin can see what it'll use.
  defaultTimerSeconds?: number | null;
  defaultPoints?: number;
}) {
  const setType = (type: QuestionType) => {
    if (type === q.type) return;
    const base = newQuestion(type);
    onChange({ ...base, id: q.id, text: q.text, image_key: q.image_key, image_url: q.image_url, trigger_time_sec: q.trigger_time_sec, timer_seconds: q.timer_seconds, points: q.points });
  };

  return (
    <div className="rounded-lg border border-line-soft bg-paper p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <select value={q.type} onChange={(e) => setType(e.target.value as QuestionType)} className="rounded-md border border-line px-2 py-1 text-[11px]">
          {Object.entries(questionTypeLabel).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
        <button onClick={onDelete}><Trash2 className="h-3.5 w-3.5 text-danger" /></button>
      </div>

      {showTiming && (
        <div className="mb-2 rounded-md bg-surface px-2.5 py-1.5">
          <div className="flex items-center justify-between text-[11px] text-ink-soft">
            <span>Shows at</span>
            <span className="font-medium text-ink">
              {q.trigger_time_sec === null ? "not set" : formatClock(q.trigger_time_sec)}
              {videoDurationSec !== null && ` / ${formatClock(videoDurationSec)}`}
            </span>
          </div>
          {videoDurationSec !== null && videoDurationSec > 0 ? (
            <input
              type="range" min={0} max={Math.floor(videoDurationSec)} value={q.trigger_time_sec ?? 0}
              onChange={(e) => onChange({ ...q, trigger_time_sec: Number(e.target.value) })}
              className="mt-1 w-full accent-primary"
            />
          ) : (
            <div className="mt-1 flex items-center gap-1.5">
              <input
                type="number" min={0} value={q.trigger_time_sec ?? ""} placeholder="sec"
                onChange={(e) => onChange({ ...q, trigger_time_sec: e.target.value === "" ? null : Number(e.target.value) })}
                className="h-6 w-20 rounded-md border border-line px-1.5 text-[11px]"
              />
              <span className="text-[10px] text-ink-faint">Upload the video first to drag this on a timeline instead.</span>
            </div>
          )}

          <label className="mt-2 flex items-center gap-1.5 text-[11px] text-ink-soft">
            <input type="checkbox" checked={isCustomTiming} onChange={onToggleCustomTiming} className="h-3 w-3" />
            Custom timer &amp; marks for this question
          </label>
          {isCustomTiming ? (
            <div className="mt-1.5 flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                Timer
                <input
                  type="number" min={1} value={q.timer_seconds ?? ""} placeholder="none"
                  onChange={(e) => onChange({ ...q, timer_seconds: e.target.value === "" ? null : Number(e.target.value) })}
                  className="h-6 w-16 rounded-md border border-line px-1.5 text-[11px]"
                />
                s
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
                Marks
                <input
                  type="number" min={1} value={q.points}
                  onChange={(e) => onChange({ ...q, points: Number(e.target.value) || 1 })}
                  className="h-6 w-14 rounded-md border border-line px-1.5 text-[11px]"
                />
              </label>
            </div>
          ) : (
            <p className="mt-1 text-[10px] text-ink-faint">
              Using module default — {defaultTimerSeconds === null ? "no timer" : `${defaultTimerSeconds}s timer`} · {defaultPoints} mark{defaultPoints === 1 ? "" : "s"}
            </p>
          )}
        </div>
      )}

      <div className="mb-2 flex items-start gap-2">
        <Input
          value={q.text ?? ""} placeholder={showImagePicker ? "Question text (optional if there's an image)" : "Question text"}
          onChange={(e) => onChange({ ...q, text: e.target.value })} className="h-8 flex-1 text-sm"
        />
        {showImagePicker && (
          <ImagePicker
            imageUrl={q.image_url}
            onUploaded={(key, url) => onChange({ ...q, image_key: key, image_url: url })}
            onRemove={() => onChange({ ...q, image_key: null, image_url: null })}
          />
        )}
      </div>

      {(q.type === "mcq" || q.type === "true_false") && (
        <>
          {q.options.map((opt) => (
            <div key={opt.id} className="mb-1 flex items-center gap-2">
              <button onClick={() => onChange({ ...q, correct_option_id: opt.id })} className="flex-shrink-0">
                {opt.id === q.correct_option_id ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <Circle className="h-3.5 w-3.5 text-ink-faint" />}
              </button>
              <input
                value={opt.text ?? ""} placeholder="Option text (optional if there's an image)"
                onChange={(e) => onChange({ ...q, options: q.options.map((o) => (o.id === opt.id ? { ...o, text: e.target.value } : o)) })}
                className="flex-1 border-b border-line-soft bg-transparent py-0.5 text-xs outline-none"
              />
              {showImagePicker && (
                <ImagePicker
                  imageUrl={opt.image_url}
                  size="h-10 w-10"
                  onUploaded={(key, url) => onChange({ ...q, options: q.options.map((o) => (o.id === opt.id ? { ...o, image_key: key, image_url: url } : o)) })}
                  onRemove={() => onChange({ ...q, options: q.options.map((o) => (o.id === opt.id ? { ...o, image_key: null, image_url: null } : o)) })}
                />
              )}
              {q.type === "mcq" && q.options.length > 2 && (
                <button onClick={() => onChange({ ...q, options: q.options.filter((o) => o.id !== opt.id), correct_option_id: q.correct_option_id === opt.id ? null : q.correct_option_id })}>
                  <X className="h-3 w-3 text-ink-faint" />
                </button>
              )}
            </div>
          ))}
          {q.type === "mcq" && (
            <button
              onClick={() => onChange({ ...q, options: [...q.options, { id: tempId("opt"), text: `Option ${String.fromCharCode(65 + q.options.length)}`, image_key: null, image_url: null }] })}
              className="mt-1 text-[11px] text-primary"
            >
              + Add option
            </button>
          )}
        </>
      )}

      {q.type === "short_answer" && (
        <div className="flex flex-col gap-1">
          <p className="text-[11px] text-ink-soft">Accepted answers (any one matches, case-insensitive)</p>
          {q.accepted_answers.map((a, ai) => (
            <div key={ai} className="flex items-center gap-2">
              <input
                value={a}
                onChange={(e) => onChange({ ...q, accepted_answers: q.accepted_answers.map((x, i) => (i === ai ? e.target.value : x)) })}
                className="flex-1 border-b border-line-soft bg-transparent py-0.5 text-xs outline-none"
              />
              {q.accepted_answers.length > 1 && (
                <button onClick={() => onChange({ ...q, accepted_answers: q.accepted_answers.filter((_, i) => i !== ai) })}>
                  <X className="h-3 w-3 text-ink-faint" />
                </button>
              )}
            </div>
          ))}
          <button onClick={() => onChange({ ...q, accepted_answers: [...q.accepted_answers, ""] })} className="mt-1 text-left text-[11px] text-primary">
            + Add alternative answer
          </button>
        </div>
      )}
    </div>
  );
}

function QuizBuilder({
  courseId, moduleId, questions, onChange,
}: { courseId: string; moduleId: string; questions: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void }) {
  const [importing, setImporting] = useState(false);
  const updateQ = (id: string, next: QuizQuestion) => onChange(questions.map((q) => (q.id === id ? next : q)));
  const deleteQ = (id: string) => onChange(questions.filter((q) => q.id !== id));

  return (
    <div className="flex flex-col gap-2.5">
      {questions.map((q) => (
        <QuestionCard key={q.id} q={q} onChange={(next) => updateQ(q.id, next)} onDelete={() => deleteQ(q.id)} />
      ))}
      <div className="flex gap-2">
        <button
          onClick={() => onChange([...questions, newQuestion("mcq")])}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2"
        >
          <Plus className="h-3 w-3 text-primary" /> <span className="text-xs font-medium text-primary">Add question</span>
        </button>
        <button
          onClick={() => setImporting((v) => !v)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2"
        >
          <Library className="h-3 w-3 text-primary" /> <span className="text-xs font-medium text-primary">Import from bank</span>
        </button>
      </div>
      {importing && (
        <BankImportPicker
          courseId={courseId} moduleId={moduleId} onDone={() => setImporting(false)}
          onImported={(mod) => onChange(mergeImportedQuestions(questions, mod.questions))}
        />
      )}
    </div>
  );
}

/** In-video questions for a WATCH module — same building blocks as
 * QuizBuilder (QuestionCard, bank import) but time-ordered, with no image
 * picker or import option for picture questions (not allowed mid-video),
 * and the timer/points fields lifted up here as module-wide defaults —
 * one timer length and one points value for every in-video question on
 * this module, changed once at the top and applied to all of them
 * automatically (including a question added or imported afterward).
 *
 * A question can still opt out of the defaults — the "Custom timer &
 * marks" checkbox on its own QuestionCard — to get its own timer/points
 * (e.g. a harder question worth more marks with more time). customIds
 * tracks which question ids are opted out; only those are skipped by the
 * auto-sync effect below, and un-checking the box snaps that question
 * straight back to the current defaults. "Shows at" always stays
 * per-question regardless, since each one fires at a different point in
 * the video.
 *
 * videoDurationSec (read client-side once the uploaded video's metadata
 * loads — see ModuleEditorRow) turns each question's "Shows at" into a
 * duration-aware slider; null until then, or if there's no video yet.
 *
 * A newly added/imported question starts with trigger_time_sec: null —
 * the backend 400s on save until the admin fills in a time, same as any
 * other required field left blank, rather than silently defaulting to 0s. */
function WatchQuestionsBuilder({
  courseId, moduleId, questions, onChange, videoDurationSec,
}: { courseId: string; moduleId: string; questions: QuizQuestion[]; onChange: (q: QuizQuestion[]) => void; videoDurationSec: number | null }) {
  const [importing, setImporting] = useState(false);
  const [defaultTimerSeconds, setDefaultTimerSeconds] = useState<number | null>(() => questions[0]?.timer_seconds ?? null);
  const [defaultPoints, setDefaultPoints] = useState<number>(() => questions[0]?.points ?? 1);
  // Which question ids have opted out of the defaults above (see
  // docstring). Seeded once from whatever already differs from the very
  // first question's values — a reasonable baseline for a module opened
  // after a previous save, before any defaults are touched again.
  const [customIds, setCustomIds] = useState<Set<string>>(
    () => new Set(questions.filter((q) => q.timer_seconds !== (questions[0]?.timer_seconds ?? null) || q.points !== (questions[0]?.points ?? 1)).map((q) => q.id)),
  );
  const didMountRef = useRef(false);

  // Keeps every non-custom question's timer_seconds/points in lockstep
  // with the defaults above — fires when the admin changes a default, or
  // when the question count changes (add/import/delete), so a freshly
  // added or bank-imported question (which otherwise lands with
  // timer_seconds: null, points: 1 from newQuestion/the backend) picks up
  // the current defaults too, without the admin having to touch it. A
  // question in customIds is left alone entirely.
  useEffect(() => {
    if (!didMountRef.current) { didMountRef.current = true; return; }
    const changed = questions.some((q) => !customIds.has(q.id) && (q.timer_seconds !== defaultTimerSeconds || q.points !== defaultPoints));
    if (changed) onChange(questions.map((q) => (customIds.has(q.id) ? q : { ...q, timer_seconds: defaultTimerSeconds, points: defaultPoints })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultTimerSeconds, defaultPoints, questions.length]);

  const updateQ = (id: string, next: QuizQuestion) => onChange(questions.map((q) => (q.id === id ? next : q)));
  const deleteQ = (id: string) => {
    onChange(questions.filter((q) => q.id !== id));
    setCustomIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const toggleCustom = (id: string) => {
    setCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
        // Opting back in to the defaults — snap this question's
        // timer/points back to them immediately rather than waiting for
        // the next default change.
        onChange(questions.map((q) => (q.id === id ? { ...q, timer_seconds: defaultTimerSeconds, points: defaultPoints } : q)));
      } else {
        next.add(id);
      }
      return next;
    });
  };
  const sorted = [...questions].sort((a, b) => (a.trigger_time_sec ?? Infinity) - (b.trigger_time_sec ?? Infinity));

  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-[11px] text-ink-soft">
        Pauses the video at each question's time below — no timer means playback stays paused until the learner submits.
      </p>

      <div className="flex items-center gap-4 rounded-lg border border-line-soft bg-surface px-3 py-2">
        <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          Default timer
          <input
            type="number" min={1} value={defaultTimerSeconds ?? ""} placeholder="none"
            onChange={(e) => setDefaultTimerSeconds(e.target.value === "" ? null : Number(e.target.value))}
            className="h-6 w-16 rounded-md border border-line px-1.5 text-[11px]"
          />
          s
        </label>
        <label className="flex items-center gap-1.5 text-[11px] text-ink-soft">
          Default points
          <input
            type="number" min={1} value={defaultPoints}
            onChange={(e) => setDefaultPoints(Number(e.target.value) || 1)}
            className="h-6 w-14 rounded-md border border-line px-1.5 text-[11px]"
          />
        </label>
        <span className="text-[10px] text-ink-faint">Applies to every in-video question below, unless it has its own "Custom timer &amp; marks" checked</span>
      </div>

      {videoDurationSec !== null && (
        <p className="text-[10.5px] text-ink-faint">Video duration: {formatClock(videoDurationSec)}</p>
      )}

      {sorted.map((q) => (
        <QuestionCard
          key={q.id} q={q} onChange={(next) => updateQ(q.id, next)} onDelete={() => deleteQ(q.id)}
          showImagePicker={false} showTiming videoDurationSec={videoDurationSec}
          isCustomTiming={customIds.has(q.id)} onToggleCustomTiming={() => toggleCustom(q.id)}
          defaultTimerSeconds={defaultTimerSeconds} defaultPoints={defaultPoints}
        />
      ))}
      <div className="flex gap-2">
        <button
          onClick={() => onChange([...questions, { ...newQuestion("mcq"), timer_seconds: defaultTimerSeconds, points: defaultPoints }])}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2"
        >
          <Plus className="h-3 w-3 text-primary" /> <span className="text-xs font-medium text-primary">Add in-video question</span>
        </button>
        <button
          onClick={() => setImporting((v) => !v)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2"
        >
          <Library className="h-3 w-3 text-primary" /> <span className="text-xs font-medium text-primary">Import from bank</span>
        </button>
      </div>
      {importing && (
        <BankImportPicker
          courseId={courseId} moduleId={moduleId} onDone={() => setImporting(false)} excludePictureQuestions
          onImported={(mod) => onChange(mergeImportedQuestions(questions, mod.questions))}
        />
      )}
    </div>
  );
}

const RESTRICTION_TYPE_LABEL: Record<ModuleRestriction["type"], string> = {
  date_window: "Date window", profile_field: "Learner profile", module_score: "Prior module score",
};

// "YYYY-MM-DDTHH:MM:SS+00:00" -> "YYYY-MM-DD", for a <input type="date"> value.
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : "";
}

export function restrictionValid(r: ModuleRestriction): boolean {
  if (r.type === "date_window") return !!(r.opens_at || r.closes_at) && (!r.opens_at || !r.closes_at || r.closes_at > r.opens_at);
  if (r.type === "profile_field") return !!r.value.trim();
  if (r.type === "module_score") return !!r.module_id && r.min_score >= 0 && r.min_score <= 100;
  return true;
}

/** One card per restriction — editable in place. `otherModules` is every
 * other module on this course, in position order, for the module_score
 * type's "which earlier module" picker. */
function RestrictionCard({
  restriction: r, otherModules, onChange, onDelete,
}: { restriction: ModuleRestriction; otherModules: Module[]; onChange: (next: ModuleRestriction) => void; onDelete: () => void }) {
  return (
    <div className="rounded-lg border border-line-soft bg-paper p-2.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink-soft">{RESTRICTION_TYPE_LABEL[r.type]}</span>
        <button onClick={onDelete}><X className="h-3 w-3 text-ink-faint" /></button>
      </div>

      {r.type === "date_window" && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <p className="mb-1 text-[10px] text-ink-faint">Opens (optional)</p>
            <input
              type="date" value={toDateInputValue(r.opens_at)}
              onChange={(e) => onChange({ ...r, opens_at: e.target.value || null })}
              className="h-7 w-full rounded-md border border-line px-1.5 text-[11px]"
            />
          </div>
          <div>
            <p className="mb-1 text-[10px] text-ink-faint">Closes (optional)</p>
            <input
              type="date" value={toDateInputValue(r.closes_at)}
              onChange={(e) => onChange({ ...r, closes_at: e.target.value || null })}
              className="h-7 w-full rounded-md border border-line px-1.5 text-[11px]"
            />
          </div>
        </div>
      )}

      {r.type === "profile_field" && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={r.field} onChange={(e) => onChange({ ...r, field: e.target.value as typeof r.field })}
            className="h-7 rounded-md border border-line px-1.5 text-[11px]"
          >
            <option value="country">Country</option>
            <option value="location">Location</option>
            <option value="job_title">Job title</option>
          </select>
          <input
            value={r.value} onChange={(e) => onChange({ ...r, value: e.target.value })}
            placeholder="e.g. China" className="h-7 rounded-md border border-line px-1.5 text-[11px]"
          />
        </div>
      )}

      {r.type === "module_score" && (
        <div className="grid grid-cols-2 gap-2">
          <select
            value={r.module_id} onChange={(e) => onChange({ ...r, module_id: e.target.value })}
            className="h-7 rounded-md border border-line px-1.5 text-[11px]"
          >
            <option value="">Choose a module…</option>
            {otherModules.map((om) => <option key={om.id} value={om.id}>{om.title}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <input
              type="number" min={0} max={100} value={r.min_score}
              onChange={(e) => onChange({ ...r, min_score: Number(e.target.value) || 0 })}
              className="h-7 w-16 rounded-md border border-line px-1.5 text-[11px]"
            />
            <span className="text-[10px] text-ink-faint">% min</span>
          </div>
        </div>
      )}
      {!restrictionValid(r) && <p className="mt-1.5 text-[10.5px] text-amber">Finish setting this up — it won't be saved until it's valid.</p>}
    </div>
  );
}

/** Access restrictions section — this module's own gates, independent of
 * (and stacking with) the course-wide "lock modules in order" setting.
 * Mirrors the question-list pattern elsewhere in this file: edits flow up
 * through onChange immediately, but a restriction only actually gets
 * saved to the server once it's complete (see restrictionValid) — an
 * admin mid-edit (e.g. just clicked "+ Prior score" and hasn't picked the
 * module yet) never gets a save error for the incomplete entry. */
function RestrictionsEditor({
  restrictions, otherModules, onChange,
}: { restrictions: ModuleRestriction[]; otherModules: Module[]; onChange: (next: ModuleRestriction[]) => void }) {
  const update = (i: number, next: ModuleRestriction) => onChange(restrictions.map((r, ri) => (ri === i ? next : r)));
  const remove = (i: number) => onChange(restrictions.filter((_, ri) => ri !== i));

  return (
    <div className="border-t border-line-soft pt-3">
      <p className="mb-1.5 text-[11px] text-ink-soft">
        Access restrictions (optional) — ALL must pass before a learner can open this module
      </p>
      {restrictions.length > 0 && (
        <div className="mb-2 flex flex-col gap-2">
          {restrictions.map((r, i) => (
            <RestrictionCard key={i} restriction={r} otherModules={otherModules} onChange={(next) => update(i, next)} onDelete={() => remove(i)} />
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-1.5">
        <button
          onClick={() => onChange([...restrictions, { type: "date_window", opens_at: null, closes_at: null }])}
          className="rounded-md border border-dashed border-line px-2 py-1 text-[10.5px] font-medium text-primary"
        >
          + Date window
        </button>
        <button
          onClick={() => onChange([...restrictions, { type: "profile_field", field: "country", value: "" }])}
          className="rounded-md border border-dashed border-line px-2 py-1 text-[10.5px] font-medium text-primary"
        >
          + Learner profile
        </button>
        <button
          disabled={otherModules.length === 0}
          onClick={() => onChange([...restrictions, { type: "module_score", module_id: otherModules[0]?.id ?? "", min_score: 60 }])}
          className="rounded-md border border-dashed border-line px-2 py-1 text-[10.5px] font-medium text-primary disabled:opacity-40"
        >
          + Prior module score
        </button>
      </div>
    </div>
  );
}

export function ModuleEditorRow({
  courseId,
  module: m,
  allModules,
  onChange,
  onDelete,
  isDirty,
  saving,
  onSave,
}: {
  courseId: string;
  module: Module;
  allModules: Module[];
  // Updates this module's local draft only — nothing is sent to the
  // server until onSave is called. The caller (CourseManagePage) still
  // owns the actual module state and marks it dirty on any onChange.
  onChange: (patch: Partial<Module>) => void;
  onDelete: () => void;
  // True once this module has unsaved local edits (tracked by the
  // caller, since it owns the pre-edit baseline to diff against).
  isDirty: boolean;
  saving: boolean;
  // Fires the actual PATCH with this module's current full state —
  // restrictions filtered to only the complete ones (see
  // restrictionValid) and questions converted to the authoring input
  // shape happen at the call site in CourseManagePage, not here.
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const { data: skills } = useSkills();
  const { data: badges } = useBadges();
  const { data: certTemplates } = useCertTemplates();

  // Read the uploaded video's real length client-side (there's no
  // backend-stored duration — the file sits behind a presigned URL, not
  // a DB column) so the in-video question timeline (WatchQuestionsBuilder)
  // can show a duration-aware "Shows at" slider instead of a blind number.
  // A hidden <video preload="metadata"> is the lightest way to get this —
  // it only fetches enough of the file to read its length, not the whole
  // video. Resets whenever the module's file changes (re-upload, or a
  // different module opened).
  const [videoDurationSec, setVideoDurationSec] = useState<number | null>(null);
  useEffect(() => { setVideoDurationSec(null); }, [m.file_url]);

  const hasContent =
    m.type === "manual" ? !!m.instructions : m.type === "quiz" ? m.questions.length > 0 : !!m.file_name;
  const removeFile = useRemoveModuleFile(courseId);

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
        {isDirty && (
          <span className="flex-shrink-0 whitespace-nowrap rounded-full bg-amber-soft px-2 py-0.5 text-[10px] font-medium text-amber">Unsaved</span>
        )}
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
              <>
                <FileMetaField
                  courseId={courseId} moduleId={m.id} label="Upload video" accept="video/mp4,video/webm,video/quicktime,video/x-matroska"
                  fileName={m.file_name} fileSizeLabel={m.file_size_label} fileUrl={m.file_url}
                />
                {m.file_url && (
                  // Off-screen — only here to read the real duration once
                  // its metadata loads (see videoDurationSec above); never
                  // shown or played.
                  // eslint-disable-next-line jsx-a11y/media-has-caption
                  <video
                    key={m.file_url} src={m.file_url} preload="metadata" className="hidden"
                    onLoadedMetadata={(e) => setVideoDurationSec(e.currentTarget.duration)}
                  />
                )}
                <div className="mt-3">
                  <p className="mb-1.5 text-[11px] text-ink-soft">In-video questions (optional)</p>
                  <WatchQuestionsBuilder
                    courseId={courseId} moduleId={m.id} questions={m.questions} onChange={(qs) => onChange({ questions: qs })}
                    videoDurationSec={videoDurationSec}
                  />
                </div>
              </>
            )}
            {m.type === "read" && (
              <FileMetaField
                courseId={courseId} moduleId={m.id} label="Upload document (PDF/DOC/PPT)" accept=".pdf,.doc,.docx,.ppt,.pptx"
                fileName={m.file_name} fileSizeLabel={m.file_size_label} fileUrl={m.file_url}
              />
            )}
            {m.type === "scorm" && (
              <ScormUploadField
                courseId={courseId} moduleId={m.id} fileName={m.file_name} fileSizeLabel={m.file_size_label}
                scormVersion={m.scorm_version} onRemove={() => removeFile.mutate(m.id)}
              />
            )}
            {m.type === "quiz" && (
              <QuizBuilder courseId={courseId} moduleId={m.id} questions={m.questions} onChange={(qs) => onChange({ questions: qs })} />
            )}
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

          {m.type === "watch" && m.questions.length > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-ink-soft">Also require correct in-video answers</span>
              <div className="flex items-center gap-1.5">
                <input
                  type="number" min={0} max={m.questions.length}
                  value={m.video_question_min_correct ?? ""}
                  placeholder="off"
                  onChange={(e) => onChange({ video_question_min_correct: e.target.value === "" ? null : Number(e.target.value) })}
                  className="h-7 w-14 rounded-md border border-line px-1.5 text-xs"
                />
                <span className="text-[10px] text-ink-faint">of {m.questions.length} correct</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between">
            <span className="text-xs text-ink-soft">Required for course completion</span>
            <Switch checked={m.required} onCheckedChange={(v) => onChange({ required: v })} />
          </div>

          <RestrictionsEditor
            restrictions={m.restrictions}
            otherModules={allModules.filter((om) => om.id !== m.id)}
            onChange={(next) => onChange({ restrictions: next })}
          />

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

          <div className="flex items-center justify-between border-t border-line-soft pt-3">
            <button onClick={onDelete} className="flex items-center gap-1.5">
              <Trash2 className="h-3 w-3 text-danger" /> <span className="text-[11.5px] text-danger">Remove module</span>
            </button>
            <button
              onClick={onSave}
              disabled={!isDirty || saving}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
            >
              {saving && <Loader2 className="h-3 w-3 animate-spin" />}
              {saving ? "Saving…" : isDirty ? "Save changes" : "Saved"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

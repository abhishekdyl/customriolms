"use client";
import { useRef, useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuestionCard } from "@/components/shell/courses/module-editor";
import { newQuestion, toQuestionInput } from "@/lib/quiz-utils";
import {
  useQuestionBanks, useQuestionBank, useCreateQuestionBank, useDeleteQuestionBank,
  useAddBankQuestion, useUpdateBankQuestion, useDeleteBankQuestion, useImportAikenQuestions,
} from "@/lib/hooks/use-question-banks";
import { api, ApiError } from "@/lib/api-client";
import type { QuizQuestion } from "@/lib/types";

// One file format, one sample, covering every question type the Aiken
// importer reads: a plain MCQ, a True/False (auto-detected because its
// two options are literally "True"/"False"), and two short-answer
// questions — one with a single accepted answer, one with several
// separated by "/". See aiken_parser.py for the full read-this-shape rules.
const AIKEN_SAMPLE = `What is the capital of France?
A) Paris
B) London
C) Berlin
D) Madrid
ANSWER: A

The Great Wall of China is visible from space with the naked eye.
A) True
B) False
ANSWER: B

Name the largest planet in our solar system.
ANSWER: Jupiter

What is 2 + 2?
ANSWER: 4/four
`;

function downloadAikenSample() {
  const blob = new Blob([AIKEN_SAMPLE], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "aiken-questions-sample.txt";
  a.click();
  URL.revokeObjectURL(url);
}

// Questions with pictures need a .zip instead of a plain .txt — the server
// builds this one on demand (see aiken_sample.py) rather than it being a
// static asset here, since it bundles actual placeholder image files.
function downloadAikenPictureSample() {
  api.download("/api/v1/question-banks/aiken-sample.zip", "aiken-picture-questions-sample.zip");
}

/** Detail view for one bank — add/edit/delete its questions. Each
 * question is saved individually (not as one big PATCH like a module's
 * question list), since a bank question has no "replace the whole set"
 * notion — it's a standalone library entry. */
function BankDetail({ bankId, onBack }: { bankId: string; onBack: () => void }) {
  const { data: bank, isLoading } = useQuestionBank(bankId);
  const addQ = useAddBankQuestion(bankId);
  const updateQ = useUpdateBankQuestion(bankId);
  const deleteQ = useDeleteBankQuestion(bankId);
  const importAiken = useImportAikenQuestions(bankId);
  const [draft, setDraft] = useState<QuizQuestion | null>(null);
  const [importedCount, setImportedCount] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Same draft-until-Save pattern as everywhere else — editing an existing
  // question only touches this local map until its own Save is clicked;
  // nothing reaches the server mid-edit. Keyed by question id so each
  // question's edit (and Save/Cancel) is independent of the others.
  const [edits, setEdits] = useState<Record<string, QuizQuestion>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  if (isLoading || !bank) return <p className="text-sm text-ink-faint">Loading…</p>;

  const onAikenFileSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportedCount(null);
    const before = bank.questions.length;
    importAiken.mutate(file, {
      onSuccess: (updated) => setImportedCount(updated.questions.length - before),
    });
    e.target.value = "";
  };

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-xs text-ink-soft">
        <ChevronLeft className="h-3.5 w-3.5" /> All banks
      </button>
      <h1 className="font-head text-xl text-ink mb-1">{bank.name}</h1>
      {bank.description && <p className="mb-4 text-sm text-ink-faint">{bank.description}</p>}

      <div className="mb-5 rounded-xl border border-dashed border-line bg-surface p-4">
        <div className="flex flex-wrap items-center gap-3">
          <Upload className="h-4 w-4 text-ink-faint" />
          <span className="text-[13px] text-ink">Bulk-add questions from an Aiken-format .txt file</span>
          <span className="text-[11px] text-ink-faint">— MCQ, True/False and short-answer all supported</span>
          <div className="ml-auto flex items-center gap-3">
            <button onClick={downloadAikenSample} className="text-[11px] text-ink-faint underline">Download sample</button>
            <button onClick={downloadAikenPictureSample} className="text-[11px] text-ink-faint underline">Download picture sample (.zip)</button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs font-medium text-primary"
              disabled={importAiken.isPending}
            >
              {importAiken.isPending ? "Importing…" : "Choose file"}
            </button>
            <input ref={fileInputRef} type="file" accept=".txt,.zip" onChange={onAikenFileSelected} className="hidden" />
          </div>
        </div>
        <p className="mt-2 text-[11px] text-ink-faint">
          Want pictures on a question or its options? Add{" "}
          <code className="rounded bg-surface-2 px-1">IMAGE: elephant.png</code> right after the question for a
          question picture, or at the end of an option line for an option picture —{" "}
          <code className="rounded bg-surface-2 px-1">A) IMAGE: nike.png</code> for a picture with no text, or{" "}
          <code className="rounded bg-surface-2 px-1">A) Nike swoosh IMAGE: nike.png</code> for text and a picture
          together. Then upload a <strong>.zip</strong> containing your .txt plus those image files instead of a
          plain .txt. See the picture sample above for a worked example.
        </p>
        {importedCount !== null && !importAiken.isError && (
          <p className="mt-2 text-[11.5px] text-success">Imported {importedCount} question{importedCount === 1 ? "" : "s"}.</p>
        )}
        {importAiken.isError && (
          <pre className="mt-2 whitespace-pre-wrap text-[11.5px] text-danger">
            {importAiken.error instanceof ApiError ? importAiken.error.message : "Import failed."}
          </pre>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {bank.questions.map((q) => {
          const edited = edits[q.id];
          const isDirty = !!edited;
          return (
            <div key={q.id}>
              <QuestionCard
                q={edited ?? q}
                onChange={(next) => setEdits((prev) => ({ ...prev, [q.id]: next }))}
                onDelete={() => { if (confirm("Delete this question?")) deleteQ.mutate(q.id); }}
              />
              {isDirty && (
                <div className="mt-1.5 flex items-center justify-end gap-3">
                  <button
                    onClick={() => setEdits((prev) => { const next = { ...prev }; delete next[q.id]; return next; })}
                    disabled={savingId === q.id}
                    className="text-[12px] text-ink-faint"
                  >
                    Cancel
                  </button>
                  <Button
                    size="sm"
                    disabled={savingId === q.id}
                    onClick={() => {
                      setSavingId(q.id);
                      updateQ.mutate(
                        { questionId: q.id, ...toQuestionInput(edited) },
                        {
                          onSuccess: () => setEdits((prev) => { const next = { ...prev }; delete next[q.id]; return next; }),
                          onSettled: () => setSavingId(null),
                        },
                      );
                    }}
                  >
                    {savingId === q.id ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        {draft && (
          <QuestionCard
            q={draft}
            onChange={setDraft}
            onDelete={() => setDraft(null)}
          />
        )}
        {draft ? (
          <div className="flex gap-2">
            <Button
              onClick={() => addQ.mutate(toQuestionInput(draft), { onSuccess: () => setDraft(null) })}
              disabled={addQ.isPending}
            >
              Save question
            </Button>
            <Button variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        ) : (
          <button
            onClick={() => setDraft(newQuestion("mcq"))}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-line py-2.5"
          >
            <Plus className="h-3.5 w-3.5 text-primary" /> <span className="text-xs font-medium text-primary">Add question</span>
          </button>
        )}
        {addQ.isError && <p className="text-xs text-danger">{(addQ.error as Error)?.message}</p>}
      </div>
    </div>
  );
}

export default function QuestionBanksPage() {
  const { data: banks, isLoading } = useQuestionBanks();
  const create = useCreateQuestionBank();
  const del = useDeleteQuestionBank();
  const [name, setName] = useState("");
  const [openBankId, setOpenBankId] = useState<string | null>(null);

  if (openBankId) return <div className="p-8 max-w-2xl"><BankDetail bankId={openBankId} onBack={() => setOpenBankId(null)} /></div>;

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="font-head text-xl text-ink mb-2">Question Banks</h1>
      <p className="text-sm text-ink-faint mb-6">
        Reusable pools of quiz questions — build once, import into any quiz module across any course.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; create.mutate({ name: name.trim() }, { onSuccess: () => setName("") }); }}
        className="mb-6 flex items-center gap-2"
      >
        <Input placeholder="New bank name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <Button type="submit" disabled={create.isPending}><Plus className="h-4 w-4" /> Create</Button>
      </form>

      {isLoading && <p className="text-sm text-ink-faint">Loading…</p>}

      <div className="flex flex-col gap-2">
        {banks?.map((b) => (
          <div key={b.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
            <button onClick={() => setOpenBankId(b.id)} className="flex-1 text-left text-sm text-ink">{b.name}</button>
            <span className="text-xs text-ink-faint">{b.question_count} question{b.question_count === 1 ? "" : "s"}</span>
            <button onClick={() => setOpenBankId(b.id)}><Pencil className="h-3.5 w-3.5 text-ink-faint" /></button>
            <button onClick={() => { if (confirm(`Delete "${b.name}" and all its questions?`)) del.mutate(b.id); }}>
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </button>
          </div>
        ))}
        {banks?.length === 0 && <p className="text-sm text-ink-faint">No question banks yet.</p>}
      </div>
    </div>
  );
}

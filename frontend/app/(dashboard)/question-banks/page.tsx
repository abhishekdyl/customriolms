"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { QuestionCard } from "@/components/shell/courses/module-editor";
import { newQuestion, toQuestionInput } from "@/lib/quiz-utils";
import {
  useQuestionBanks, useQuestionBank, useCreateQuestionBank, useDeleteQuestionBank,
  useAddBankQuestion, useUpdateBankQuestion, useDeleteBankQuestion,
} from "@/lib/hooks/use-question-banks";
import type { QuizQuestion } from "@/lib/types";

/** Detail view for one bank — add/edit/delete its questions. Each
 * question is saved individually (not as one big PATCH like a module's
 * question list), since a bank question has no "replace the whole set"
 * notion — it's a standalone library entry. */
function BankDetail({ bankId, onBack }: { bankId: string; onBack: () => void }) {
  const { data: bank, isLoading } = useQuestionBank(bankId);
  const addQ = useAddBankQuestion(bankId);
  const updateQ = useUpdateBankQuestion(bankId);
  const deleteQ = useDeleteBankQuestion(bankId);
  const [draft, setDraft] = useState<QuizQuestion | null>(null);

  if (isLoading || !bank) return <p className="text-sm text-ink-faint">Loading…</p>;

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 text-xs text-ink-soft">
        <ChevronLeft className="h-3.5 w-3.5" /> All banks
      </button>
      <h1 className="font-head text-xl text-ink mb-1">{bank.name}</h1>
      {bank.description && <p className="mb-4 text-sm text-ink-faint">{bank.description}</p>}

      <div className="flex flex-col gap-2.5">
        {bank.questions.map((q) => (
          <QuestionCard
            key={q.id}
            q={q}
            onChange={(next) => updateQ.mutate({ questionId: q.id, ...toQuestionInput(next) })}
            onDelete={() => { if (confirm("Delete this question?")) deleteQ.mutate(q.id); }}
          />
        ))}

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

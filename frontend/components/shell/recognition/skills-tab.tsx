"use client";
import { useState } from "react";
import { Check, Pencil, Plus, Target, Trash2, X } from "lucide-react";
import { useCreateSkill, useDeleteSkill, useRenameSkill, useSkills } from "@/lib/hooks/use-skills";
import { ConfirmRow, IconBtn } from "./ui";

export function SkillsTab({ query = "" }: { query?: string }) {
  const { data: skills = [], isLoading } = useSkills();
  const create = useCreateSkill();
  const rename = useRenameSkill();
  const remove = useDeleteSkill();

  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const add = () => {
    if (!newName.trim()) return;
    create.mutate(newName.trim(), { onSuccess: () => { setNewName(""); setAdding(false); } });
  };
  const save = (id: string) => {
    if (!editName.trim()) return;
    rename.mutate({ id, name: editName.trim() }, { onSuccess: () => setEditingId(null) });
  };

  return (
    <div className="max-w-[560px]">
      <p className="text-[12.5px] text-ink-faint mb-4">
        Skills power the skill profile radar (learner app) and the skill-coverage heatmap (Dashboard). Tag a module with a skill under Courses → Manage → module → Skills, and both update automatically.
      </p>
      <div className="flex flex-col gap-2 mb-3">
        {isLoading && <div className="text-[12.5px] text-ink-faint">Loading…</div>}
        {skills.filter((s) => s.name.toLowerCase().includes(query.trim().toLowerCase())).map((s) => (
          <div key={s.id} className="bg-surface border border-line rounded-lg">
            {confirmId === s.id ? (
              <div className="p-3 flex">
                <ConfirmRow
                  label={`Delete "${s.name}"? It disappears from the heatmap and any learner profile.`}
                  busy={remove.isPending}
                  onConfirm={() => remove.mutate(s.id, { onSuccess: () => setConfirmId(null) })}
                  onCancel={() => setConfirmId(null)}
                />
              </div>
            ) : editingId === s.id ? (
              <div className="flex items-center gap-2 p-3">
                <input
                  autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && save(s.id)}
                  className="flex-1 text-[13px] border border-line rounded-md px-[9px] py-1.5 outline-none focus:border-primary"
                />
                <button type="button" onClick={() => save(s.id)} className="px-2.5 py-1.5 bg-primary rounded-[5px]"><Check size={12} className="text-white" /></button>
                <button type="button" onClick={() => setEditingId(null)} className="px-2.5 py-1.5"><X size={12} className="text-ink-soft" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-3 p-3">
                <Target size={14} className="text-primary" />
                <span className="text-[13px] text-ink flex-1">{s.name}</span>
                <span className="text-[11.5px] text-ink-faint">{s.module_count} module{s.module_count !== 1 ? "s" : ""}</span>
                <IconBtn icon={Pencil} label="Rename" onClick={() => { setEditingId(s.id); setEditName(s.name); }} />
                <IconBtn icon={Trash2} danger label="Delete" onClick={() => setConfirmId(s.id)} />
              </div>
            )}
          </div>
        ))}
      </div>
      {adding ? (
        <div className="flex gap-2">
          <input
            autoFocus value={newName} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()} placeholder="Skill name"
            className="flex-1 text-[13px] border border-line rounded-md px-2.5 py-[7px] outline-none focus:border-primary bg-surface"
          />
          <button type="button" onClick={add} disabled={create.isPending} className="px-3.5 py-1.5 bg-primary rounded-md text-[12px] text-white font-medium disabled:opacity-60">Add</button>
          <button type="button" onClick={() => setAdding(false)} className="px-2 py-1.5 text-[12px] text-ink-soft">Cancel</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} className="flex items-center gap-1.5 active:opacity-70">
          <Plus size={13} className="text-primary" />
          <span className="text-[12.5px] text-primary font-medium">Add skill</span>
        </button>
      )}
    </div>
  );
}

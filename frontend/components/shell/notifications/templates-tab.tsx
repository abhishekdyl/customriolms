"use client";
import { useRef, useState } from "react";
import { MessageSquare, Pencil, Plus, Trash2 } from "lucide-react";
import { useCreateTemplate, useDeleteTemplate, useTemplates, useUpdateTemplate } from "@/lib/hooks/use-notifications";
import { templateVars, type NotifTemplate } from "@/lib/notifications";
import { ConfirmRow, IconBtn } from "@/components/shell/recognition/ui";

type Draft = { name: string; subject: string; body: string };

function TemplateEditor({
  initial, saving, onSave, onCancel,
}: { initial: Draft; saving: boolean; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState(initial);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const insertVar = (v: string) => {
    const el = bodyRef.current;
    const s = el?.selectionStart ?? d.body.length;
    const e = el?.selectionEnd ?? d.body.length;
    setD({ ...d, body: d.body.slice(0, s) + v + d.body.slice(e) });
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(s + v.length, s + v.length); });
  };
  const field = "w-full text-[13px] border border-line rounded-md px-2.5 py-2 outline-none focus:border-primary";
  return (
    <div className="bg-surface border-[1.5px] border-primary rounded-[10px] p-5">
      <input value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} className="font-head text-[15px] border border-line rounded-md px-2.5 py-[7px] w-full mb-2.5 outline-none" />
      <div className="text-[11.5px] text-ink-soft mb-1">Subject</div>
      <input value={d.subject} onChange={(e) => setD({ ...d, subject: e.target.value })} className={`${field} mb-3`} />
      <div className="text-[11.5px] text-ink-soft mb-1">Body</div>
      <textarea ref={bodyRef} value={d.body} onChange={(e) => setD({ ...d, body: e.target.value })} className={`${field} min-h-[140px] resize-y mb-2.5 p-2.5`} />
      <div className="flex flex-wrap gap-1.5 mb-4">
        {templateVars.map((v) => (
          <button key={v} type="button" onClick={() => insertVar(v)} className="px-2 py-1 bg-primary-soft rounded-[5px] text-[11px] text-primary">{v}</button>
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={saving || !d.name.trim() || !d.subject.trim()} onClick={() => onSave(d)} className="px-4 py-2 bg-primary rounded-md text-[12.5px] text-white font-medium disabled:opacity-60">Save template</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-[12.5px] text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}

export function TemplatesTab() {
  const { data: templates = [], isLoading } = useTemplates();
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const remove = useDeleteTemplate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <div className="max-w-[640px]">
      <p className="text-[12.5px] text-ink-faint mb-4">
        These templates are used automatically by the reminder rules below. Variables like <code className="font-mono">{"{{learner_name}}"}</code> are filled in per recipient when the email sends.
      </p>
      <div className="flex flex-col gap-2.5">
        {isLoading && <div className="text-[12.5px] text-ink-faint">Loading…</div>}
        {templates.map((t: NotifTemplate) =>
          editingId === t.id ? (
            <TemplateEditor
              key={t.id} initial={{ name: t.name, subject: t.subject, body: t.body }} saving={update.isPending}
              onSave={(d) => update.mutate({ id: t.id, ...d }, { onSuccess: () => setEditingId(null) })}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={t.id} className="bg-surface border border-line rounded-[10px]">
              {confirmId === t.id ? (
                <div className="p-4 flex">
                  <ConfirmRow
                    label={`Delete "${t.name}" template?`} busy={remove.isPending}
                    onConfirm={() => remove.mutate(t.id, { onSuccess: () => setConfirmId(null) })}
                    onCancel={() => setConfirmId(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4">
                  <div className="w-[34px] h-[34px] rounded-[9px] bg-primary-soft shrink-0 flex items-center justify-center">
                    <MessageSquare size={15} className="text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-ink font-medium">
                      {t.name}{!t.editable && <span className="text-[10.5px] text-ink-faint font-normal"> · System</span>}
                    </div>
                    <div className="text-[11.5px] text-ink-faint truncate">{t.subject}</div>
                  </div>
                  <IconBtn icon={Pencil} label="Edit" onClick={() => setEditingId(t.id)} />
                  {t.editable && <IconBtn icon={Trash2} danger label="Delete" onClick={() => setConfirmId(t.id)} />}
                </div>
              )}
            </div>
          ),
        )}
        {creating && (
          <TemplateEditor
            initial={{ name: "New template", subject: "Subject line", body: "Hi {{learner_name}},\n\n" }} saving={create.isPending}
            onSave={(d) => create.mutate(d, { onSuccess: () => setCreating(false) })}
            onCancel={() => setCreating(false)}
          />
        )}
        {!creating && (
          <button type="button" onClick={() => setCreating(true)} className="w-full flex items-center justify-center gap-1.5 py-2.5 border-[1.5px] border-dashed border-line rounded-[10px] active:opacity-70">
            <Plus size={13} className="text-primary" />
            <span className="text-[12.5px] text-primary font-medium">Add template</span>
          </button>
        )}
      </div>
    </div>
  );
}

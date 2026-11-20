"use client";
import { useRef, useState } from "react";
import { Trash2, Upload } from "lucide-react";
import {
  useCreatePointLevel, useDeletePointLevel, usePointLevels, useRemovePointLevelImage, useUpdatePointLevel,
  useUploadPointLevelImage, type PointLevel, type PointLevelDraft,
} from "@/lib/hooks/use-point-levels";

const emptyDraft: PointLevelDraft = { name: "", min_points: 0, max_points: null, color: "#778899", sort_order: 0 };

export function LevelsPanel() {
  const { data: levels = [], isLoading } = usePointLevels();
  const create = useCreatePointLevel();
  const update = useUpdatePointLevel();
  const remove = useDeletePointLevel();
  const uploadImage = useUploadPointLevelImage();
  const removeImage = useRemovePointLevelImage();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<PointLevelDraft>(emptyDraft);
  const [draftImage, setDraftImage] = useState<File | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const formImageInput = useRef<HTMLInputElement | null>(null);

  const startEdit = (lv: PointLevel) => {
    setEditingId(lv.id);
    setDraft({ name: lv.name, min_points: lv.min_points, max_points: lv.max_points, color: lv.color, sort_order: lv.sort_order });
    setDraftImage(null);
  };
  const startNew = () => {
    setEditingId("new");
    // Min points picks up right where the last level's max left off, so
    // tiers stay contiguous without the admin having to do the math.
    const sorted = [...levels].sort((a, b) => a.min_points - b.min_points);
    const last = sorted[sorted.length - 1];
    const autoMin = last ? (last.max_points ?? last.min_points) + 1 : 0;
    setDraft({ ...emptyDraft, min_points: autoMin, sort_order: levels.length + 1 });
    setDraftImage(null);
  };
  const cancel = () => { setEditingId(null); setDraft(emptyDraft); setDraftImage(null); };

  const save = () => {
    if (!draft.name.trim()) return;
    if (editingId === "new") {
      create.mutate(draft, {
        onSuccess: (created) => {
          if (draftImage) uploadImage.mutate({ id: created.id, file: draftImage });
          cancel();
        },
      });
    } else if (editingId) {
      update.mutate({ id: editingId, ...draft }, {
        onSuccess: () => {
          if (draftImage) uploadImage.mutate({ id: editingId, file: draftImage });
          cancel();
        },
      });
    }
  };

  return (
    <div>
      <h3 className="font-head text-[13.5px] text-ink mb-1">Levels / Tiers</h3>
      <p className="text-[11.5px] text-ink-faint mb-3">
        A learner's tier on the leaderboard is whichever range below their total points falls into — leave "Max points"
        blank on the top tier for an open-ended "and above".
      </p>

      {(editingId === "new" || (editingId && levels.some((l) => l.id === editingId))) && (
        <div className="bg-surface border-[1.5px] border-primary rounded-[10px] p-4 mb-3">
          <div className="grid grid-cols-2 gap-2.5 mb-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Level/Tier name</span>
              <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Sort order</span>
              <input type="number" value={draft.sort_order} onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })} className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Min points</span>
              <input type="number" min={0} value={draft.min_points} onChange={(e) => setDraft({ ...draft, min_points: Number(e.target.value) })} className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Max points (blank = unlimited)</span>
              <input
                type="number" min={0} value={draft.max_points ?? ""}
                onChange={(e) => setDraft({ ...draft, max_points: e.target.value === "" ? null : Number(e.target.value) })}
                className="text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-paper"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Color</span>
              <input type="color" value={draft.color} onChange={(e) => setDraft({ ...draft, color: e.target.value })} className="h-8 w-16 border border-line rounded-md bg-paper" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] text-ink-faint">Level image (optional)</span>
              <input
                ref={formImageInput} type="file" accept="image/*" className="hidden"
                onChange={(e) => setDraftImage(e.target.files?.[0] ?? null)}
              />
              <button
                type="button" onClick={() => formImageInput.current?.click()}
                className="flex items-center gap-1.5 text-[12px] text-ink-soft border border-line rounded-md px-2 py-1.5 bg-paper active:opacity-70"
              >
                <Upload size={13} />
                <span className="truncate">{draftImage ? draftImage.name : "Choose image"}</span>
              </button>
            </label>
          </div>
          <div className="flex gap-2">
            <button type="button" disabled={create.isPending || update.isPending || !draft.name.trim()} onClick={save} className="px-3.5 py-1.5 bg-primary rounded-[5px] text-[12px] text-white font-medium disabled:opacity-60">Save changes</button>
            <button type="button" onClick={cancel} className="px-3.5 py-1.5 text-[12px] text-ink-soft">Cancel</button>
          </div>
        </div>
      )}

      {isLoading && <div className="text-[12px] text-ink-faint mb-2">Loading…</div>}
      <div className="flex flex-col gap-1.5 mb-3">
        {levels.map((lv) => (
          <div key={lv.id} className="flex items-center gap-3 border border-line rounded-[8px] px-3 py-2">
            <div className="w-8 h-8 rounded-[8px] shrink-0 overflow-hidden flex items-center justify-center" style={{ background: lv.color + "22" }}>
              {lv.image_url ? <img src={lv.image_url} alt={lv.name} className="w-full h-full object-cover" /> : <div className="w-3 h-3 rounded-full" style={{ background: lv.color }} />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[12.5px] text-ink font-medium truncate">{lv.name}</div>
              <div className="text-[11px] text-ink-faint">{lv.min_points} – {lv.max_points ?? "∞"} pts</div>
            </div>
            <input
              ref={(el) => { fileInputs.current[lv.id] = el; }} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadImage.mutate({ id: lv.id, file: f }); e.target.value = ""; }}
            />
            <button type="button" title="Upload level image" onClick={() => fileInputs.current[lv.id]?.click()} className="text-ink-faint active:opacity-60 shrink-0"><Upload size={14} /></button>
            {lv.image_url && <button type="button" title="Remove image" onClick={() => removeImage.mutate(lv.id)} className="text-[11px] text-ink-faint active:opacity-60 shrink-0">clear</button>}
            <button type="button" onClick={() => startEdit(lv)} className="text-[12px] text-primary shrink-0">Edit</button>
            <button type="button" onClick={() => remove.mutate(lv.id)} className="text-danger active:opacity-60 shrink-0" title="Delete"><Trash2 size={14} /></button>
          </div>
        ))}
        {!isLoading && levels.length === 0 && <div className="text-[12px] text-ink-faint">No levels yet.</div>}
      </div>

      {editingId === null && (
        <button type="button" onClick={startNew} className="w-full flex items-center justify-center gap-1.5 py-2.5 border-[1.5px] border-dashed border-line rounded-[10px] active:opacity-70">
          <span className="text-[12.5px] text-primary font-medium">Add level/tier</span>
        </button>
      )}
    </div>
  );
}

"use client";
import { useState } from "react";
import { Award, Pencil, Plus, Trash2 } from "lucide-react";
import { useBadges, useCreateBadge, useDeleteBadge, useUpdateBadge } from "@/lib/hooks/use-badges";
import { badgeCriteriaLabel, badgeCriteriaValueHint, colorChoices } from "@/lib/recognition";
import type { Badge, BadgeCriteria } from "@/lib/types";
import { useCourses } from "@/lib/hooks/use-courses";
import { useCategories } from "@/lib/hooks/use-categories";
import { ConfirmRow, IconBtn } from "./ui";

type Draft = { name: string; criteria: BadgeCriteria; value: string; color: string };

function BadgeEditor({
  initial, saving, onSave, onCancel,
}: { initial: Draft; saving: boolean; onSave: (d: Draft) => void; onCancel: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const { data: courses = [] } = useCourses();
  const { data: categories = [] } = useCategories();

  return (
    <div className="bg-surface border-[1.5px] border-primary rounded-[10px] p-4">
      <input
        value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
        className="font-head text-[14px] border border-line rounded-md px-[9px] py-[7px] w-full mb-2.5 outline-none"
      />
      <div className="flex items-center gap-2 mb-3">
        <select
          value={d.criteria}
          onChange={(e) => {
            const criteria = e.target.value as BadgeCriteria;
            // Switching criteria invalidates whatever free-text value was
            // there before (a day count doesn't mean anything as a course id).
            setD({ ...d, criteria, value: "" });
          }}
          className="flex-1 text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-surface"
        >
          {(Object.keys(badgeCriteriaLabel) as BadgeCriteria[]).map((k) => <option key={k} value={k}>{badgeCriteriaLabel[k]}</option>)}
        </select>
        {d.criteria === "course_complete" ? (
          <select
            value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })}
            className="w-[150px] text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-surface"
          >
            <option value="">Pick a course…</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        ) : d.criteria === "category_complete" ? (
          <select
            value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })}
            className="w-[150px] text-[12.5px] border border-line rounded-md px-2 py-1.5 bg-surface"
          >
            <option value="">Pick a category…</option>
            {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
          </select>
        ) : (
          <input
            value={d.value} onChange={(e) => setD({ ...d, value: e.target.value })}
            placeholder={badgeCriteriaValueHint[d.criteria]}
            className="w-[110px] text-[12.5px] border border-line rounded-md px-2 py-1.5"
          />
        )}
      </div>
      <div className="flex items-center gap-2 mb-4">
        {colorChoices.map((c) => (
          <button
            key={c} type="button" aria-label={c} onClick={() => setD({ ...d, color: c })}
            className="w-5 h-5 rounded-full"
            style={{ background: c, border: d.color === c ? "2px solid var(--color-ink)" : "2px solid transparent" }}
          />
        ))}
      </div>
      <div className="flex gap-2">
        <button type="button" disabled={saving || !d.name.trim() || !d.value.trim()} onClick={() => onSave(d)} className="px-3.5 py-1.5 bg-primary rounded-[5px] text-[12px] text-white font-medium disabled:opacity-60">Save</button>
        <button type="button" onClick={onCancel} className="px-3.5 py-1.5 text-[12px] text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}

export function BadgesTab({ query = "" }: { query?: string }) {
  const { data: badges = [], isLoading } = useBadges();
  const create = useCreateBadge();
  const update = useUpdateBadge();
  const remove = useDeleteBadge();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const { data: courses = [] } = useCourses();

  const displayValue = (b: Badge) => {
    if (b.criteria === "course_complete") {
      return courses.find((c) => c.id === b.value)?.title ?? b.value;
    }
    return b.value;
  };

  return (
    <div className="max-w-[560px]">
      <p className="text-[12.5px] text-ink-faint mb-4">
        Badges are awarded automatically when a learner meets the criteria — shown on their Progress tab and factored into leaderboard standing.
      </p>
      <div className="flex flex-col gap-2.5">
        {isLoading && <div className="text-[12.5px] text-ink-faint">Loading…</div>}
        {badges.filter((b: Badge) => b.name.toLowerCase().includes(query.trim().toLowerCase())).map((b: Badge) =>
          editingId === b.id ? (
            <BadgeEditor
              key={b.id}
              initial={{ name: b.name, criteria: b.criteria, value: b.value, color: b.color }}
              saving={update.isPending}
              onSave={(d) => update.mutate({ id: b.id, ...d }, { onSuccess: () => setEditingId(null) })}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={b.id} className="bg-surface border border-line rounded-[10px]">
              {confirmId === b.id ? (
                <div className="p-4 flex">
                  <ConfirmRow
                    label={`Delete "${b.name}" badge? Learners who earned it keep it, but it won't be awarded again.`}
                    busy={remove.isPending}
                    onConfirm={() => remove.mutate(b.id, { onSuccess: () => setConfirmId(null) })}
                    onCancel={() => setConfirmId(null)}
                  />
                </div>
              ) : (
                <div className="flex items-center gap-3 p-4">
                  <div className="w-[34px] h-[34px] rounded-[9px] shrink-0 flex items-center justify-center" style={{ background: b.color + "22" }}>
                    <Award size={16} color={b.color} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13.5px] text-ink font-medium">{b.name}</div>
                    <div className="text-[11.5px] text-ink-faint">{badgeCriteriaLabel[b.criteria]} {displayValue(b)}</div>
                  </div>
                  <IconBtn icon={Pencil} label="Edit" onClick={() => setEditingId(b.id)} />
                  <IconBtn icon={Trash2} danger label="Delete" onClick={() => setConfirmId(b.id)} />
                </div>
              )}
            </div>
          ),
        )}
        {creating && (
          <BadgeEditor
            initial={{ name: "New badge", criteria: "streak", value: "5", color: colorChoices[badges.length % colorChoices.length] }}
            saving={create.isPending}
            onSave={(d) => create.mutate(d, { onSuccess: () => setCreating(false) })}
            onCancel={() => setCreating(false)}
          />
        )}
        {!creating && (
          <button
            type="button" onClick={() => setCreating(true)}
            className="w-full flex items-center justify-center gap-1.5 py-2.5 border-[1.5px] border-dashed border-line rounded-[10px] active:opacity-70"
          >
            <Plus size={13} className="text-primary" />
            <span className="text-[12.5px] text-primary font-medium">Add badge</span>
          </button>
        )}
      </div>
    </div>
  );
}

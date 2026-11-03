"use client";
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  useCourseGroups, useCreateCourseGroup, useUpdateCourseGroup, useDeleteCourseGroup,
} from "@/lib/hooks/use-courses";
import { isoToLocal, localToIso } from "@/lib/utils";
import type { CourseGroup, EnrolledLearner } from "@/lib/types";

/** One group's own card — rename, member picker, optional group-wide due
 * date, delete. Every field change saves immediately (PATCH), same
 * "no separate Save button" convention as the due-date editor in the
 * Participants tab below — a group is a small enough object that a
 * draft-until-save step would just be friction. */
function GroupCard({
  group, enrolled, onUpdate, onDelete, saving,
}: {
  group: CourseGroup;
  enrolled: EnrolledLearner[];
  onUpdate: (patch: { name?: string; member_user_ids?: string[]; due_at?: string | null }) => void;
  onDelete: () => void;
  saving: boolean;
}) {
  const [name, setName] = useState(group.name);
  const [pickerOpen, setPickerOpen] = useState(false);
  const members = new Set(group.member_user_ids);

  return (
    <div className="rounded-lg border border-line-soft bg-paper p-3">
      <div className="mb-2 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => { if (name.trim() && name !== group.name) onUpdate({ name: name.trim() }); }}
          className="h-7 flex-1 rounded-md border border-line bg-surface px-2 text-[12.5px] font-medium text-ink outline-none focus-visible:border-primary"
        />
        <button onClick={onDelete} className="rounded-md p-1 text-ink-faint hover:text-danger" title="Delete group">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <p className="text-[10.5px] text-ink-faint">{group.member_count} member{group.member_count === 1 ? "" : "s"}</p>
        <button onClick={() => setPickerOpen((v) => !v)} className="text-[11px] text-primary">
          {pickerOpen ? "Done" : "Edit members"}
        </button>
      </div>

      {pickerOpen && (
        <div className="mb-2 max-h-40 overflow-y-auto rounded-md border border-line-soft">
          {enrolled.length === 0 && <p className="p-2 text-[11px] text-ink-faint">No one's enrolled in this course yet.</p>}
          {enrolled.map((e) => {
            const checked = members.has(e.user_id);
            return (
              <label key={e.user_id} className="flex items-center gap-2 border-b border-line-soft px-2 py-1.5 text-[11.5px] text-ink-soft last:border-b-0">
                <input
                  type="checkbox" checked={checked}
                  onChange={() => {
                    const next = new Set(members);
                    if (checked) next.delete(e.user_id); else next.add(e.user_id);
                    onUpdate({ member_user_ids: Array.from(next) });
                  }}
                />
                {e.name} <span className="text-ink-faint">· {e.email}</span>
              </label>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between border-t border-line-soft pt-2">
        <div>
          <p className="text-[11px] text-ink">Group due date</p>
          <p className="text-[10px] text-ink-faint">Applies to every member without their own personal due-date override.</p>
        </div>
        <div className="flex items-center gap-1.5">
          <input
            type="datetime-local"
            value={isoToLocal(group.due_at)}
            onChange={(e) => onUpdate({ due_at: e.target.value ? localToIso(e.target.value) : null })}
            className="h-7 rounded-md border border-line px-1.5 text-[11px]"
          />
          {group.due_at && (
            <button onClick={() => onUpdate({ due_at: null })} className="text-[10.5px] text-primary">Clear</button>
          )}
        </div>
      </div>
      {saving && <p className="mt-1.5 text-[10px] text-ink-faint">Saving…</p>}
    </div>
  );
}

/** Groups/cohorts inside this course — create, rename, pick members, set
 * an optional group-wide due date, delete. Lives in the course's "More"
 * tab, Org Admin only (see courses.py's group routes). */
export function GroupsPanel({ courseId, enrolled }: { courseId: string; enrolled: EnrolledLearner[] }) {
  const { data: groups, isLoading } = useCourseGroups(courseId);
  const createGroup = useCreateCourseGroup(courseId);
  const updateGroup = useUpdateCourseGroup(courseId);
  const deleteGroup = useDeleteCourseGroup(courseId);
  const [newName, setNewName] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

  const update = (groupId: string, patch: { name?: string; member_user_ids?: string[]; due_at?: string | null }) => {
    setSavingId(groupId);
    updateGroup.mutate({ groupId, body: patch }, { onSettled: () => setSavingId(null) });
  };

  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <p className="mb-1 text-xs font-medium text-ink-faint">Groups / cohorts</p>
      <p className="mb-3 text-[10.5px] text-ink-faint">
        Split enrolled learners into sub-groups — e.g. "Batch A", "Morning cohort" — to scope reporting, gate a
        module to just that group (module restrictions, below), or give the group its own due date.
      </p>

      {isLoading && <p className="text-xs text-ink-faint">Loading…</p>}

      <div className="mb-3 flex flex-col gap-2">
        {(groups ?? []).map((g) => (
          <GroupCard
            key={g.id}
            group={g}
            enrolled={enrolled}
            saving={savingId === g.id}
            onUpdate={(patch) => update(g.id, patch)}
            onDelete={() => { if (confirm(`Delete "${g.name}"? Any module restriction or due date tied to it stops applying.`)) deleteGroup.mutate(g.id); }}
          />
        ))}
        {groups && groups.length === 0 && (
          <p className="text-xs text-ink-faint">No groups yet — add one below.</p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
          createGroup.mutate({ name: newName.trim() }, { onSuccess: () => setNewName("") });
        }}
        className="flex gap-2"
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New group name, e.g. Batch A"
          className="h-8 flex-1 rounded-md border border-line px-2 text-xs outline-none focus-visible:border-primary"
        />
        <button
          type="submit"
          disabled={!newName.trim() || createGroup.isPending}
          className="flex items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-white disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add group
        </button>
      </form>
    </div>
  );
}

"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, Users as UsersIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useTeams, useCreateTeam, useRenameTeam, useDeleteTeam } from "@/lib/hooks/use-teams";

export default function TeamsPage() {
  const { data: teams, isLoading, isError } = useTeams();
  const createTeam = useCreateTeam();
  const renameTeam = useRenameTeam();
  const deleteTeam = useDeleteTeam();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const submitCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createTeam.mutate(newName.trim(), { onSuccess: () => setNewName("") });
  };

  return (
    <div className="p-8">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-head text-xl text-ink">Teams</h1>
      </div>

      <form onSubmit={submitCreate} className="mb-6 flex gap-2">
        <Input placeholder="New team name" value={newName} onChange={(e) => setNewName(e.target.value)} className="max-w-xs" />
        <Button type="submit" disabled={createTeam.isPending}>
          <Plus className="h-4 w-4" /> Add team
        </Button>
      </form>

      {isLoading && <p className="text-sm text-ink-faint">Loading teams…</p>}
      {isError && <p className="text-sm text-danger">Couldn&apos;t load teams — is the backend running?</p>}

      <div className="flex flex-col gap-2">
        {teams?.map((team) => (
          <div key={team.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft">
              <UsersIcon className="h-4 w-4 text-primary" />
            </div>
            {editingId === team.id ? (
              <>
                <Input value={editValue} onChange={(e) => setEditValue(e.target.value)} className="max-w-xs" autoFocus />
                <Button size="sm" onClick={() => renameTeam.mutate({ id: team.id, name: editValue }, { onSuccess: () => setEditingId(null) })}>
                  Save
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>Cancel</Button>
              </>
            ) : (
              <>
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink">{team.name}</div>
                  <div className="text-xs text-ink-faint">{team.member_count} members</div>
                </div>
                <Button size="icon" variant="ghost" onClick={() => { setEditingId(team.id); setEditValue(team.name); }}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" onClick={() => { if (confirm(`Delete "${team.name}"? Members are unassigned, not deleted.`)) deleteTeam.mutate(team.id); }}>
                  <Trash2 className="h-3.5 w-3.5 text-danger" />
                </Button>
              </>
            )}
          </div>
        ))}
        {teams?.length === 0 && <p className="text-sm text-ink-faint">No teams yet — add your first one above.</p>}
      </div>
    </div>
  );
}

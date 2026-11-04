"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-client";
import {
  useCapabilityCatalog,
  useCustomRoles,
  useCreateCustomRole,
  useUpdateCustomRole,
  useDeleteCustomRole,
} from "@/lib/hooks/use-custom-roles";
import type { CustomRole } from "@/lib/types";

type Scope = "org" | "own_team";

type FormState = {
  name: string;
  description: string;
  scope: Scope;
  capabilities: string[];
};

const emptyForm: FormState = { name: "", description: "", scope: "org", capabilities: [] };

export default function RolesPage() {
  const { data: roles, isLoading } = useCustomRoles();
  const { data: catalog } = useCapabilityCatalog();
  const createRole = useCreateCustomRole();
  const updateRole = useUpdateCustomRole();
  const deleteRole = useDeleteCustomRole();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CustomRole | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const mutation = editing ? updateRole : createRole;

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (role: CustomRole) => {
    setEditing(role);
    setForm({ name: role.name, description: role.description, scope: role.scope, capabilities: [...role.capabilities] });
    setOpen(true);
  };

  const toggleCapability = (key: string) => {
    setForm((f) => ({
      ...f,
      capabilities: f.capabilities.includes(key) ? f.capabilities.filter((c) => c !== key) : [...f.capabilities, key],
    }));
  };

  const toggleGroup = (keys: string[], allSelected: boolean) => {
    setForm((f) => ({
      ...f,
      capabilities: allSelected
        ? f.capabilities.filter((c) => !keys.includes(c))
        : [...new Set([...f.capabilities, ...keys])],
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    if (editing) {
      updateRole.mutate(
        { roleId: editing.id, name: form.name.trim(), description: form.description.trim(), scope: form.scope, capabilities: form.capabilities },
        { onSuccess: () => setOpen(false) }
      );
    } else {
      createRole.mutate(
        { name: form.name.trim(), description: form.description.trim(), scope: form.scope, capabilities: form.capabilities },
        { onSuccess: () => setOpen(false) }
      );
    }
  };

  const handleDelete = (role: CustomRole) => {
    if (!confirm(`Delete the "${role.name}" role?`)) return;
    setDeleteError(null);
    deleteRole.mutate(role.id, {
      onError: (err) => setDeleteError(err instanceof ApiError ? err.message : `Couldn't delete "${role.name}".`),
    });
  };

  return (
    <div className="p-8 max-w-3xl">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="font-head text-xl text-ink">Roles</h1>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4" /> New role
        </Button>
      </div>
      <p className="mb-6 text-sm text-ink-faint">
        Define custom roles with exactly the capabilities they need. Super Admin, Org Admin, Team Lead and Learner are
        built in and can&apos;t be changed here.
      </p>

      {deleteError && (
        <p className="mb-4 rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">{deleteError}</p>
      )}

      {isLoading && <p className="text-sm text-ink-faint">Loading roles…</p>}

      <div className="flex flex-col gap-2">
        {roles?.map((role) => (
          <div key={role.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft">
              <KeyRound className="h-4 w-4 text-primary" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-ink">{role.name}</span>
                <span className="rounded-full bg-line-soft px-2 py-0.5 text-[11px] text-ink-faint">
                  {role.scope === "own_team" ? "Own team only" : "Whole org"}
                </span>
              </div>
              {role.description && <div className="text-xs text-ink-faint">{role.description}</div>}
              <div className="text-xs text-ink-faint">
                {role.capabilities.length} capabilit{role.capabilities.length === 1 ? "y" : "ies"} · {role.user_count} user
                {role.user_count === 1 ? "" : "s"}
              </div>
            </div>
            <Button size="icon" variant="ghost" onClick={() => openEdit(role)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" onClick={() => handleDelete(role)}>
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </Button>
          </div>
        ))}
        {roles?.length === 0 && <p className="text-sm text-ink-faint">No custom roles yet — create your first one above.</p>}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit "${editing.name}"` : "New role"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submit} className="flex flex-col gap-5 p-6">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-soft">Name</label>
              <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Content Manager" />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-soft">Description</label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What this role is for"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-ink-soft">Visibility scope</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, scope: "org" }))}
                  className={`flex-1 rounded-lg border p-3 text-left text-sm ${form.scope === "org" ? "border-primary bg-primary-soft text-ink" : "border-line text-ink-soft"}`}
                >
                  <div className="font-medium">Whole org</div>
                  <div className="text-xs text-ink-faint">Sees and manages data across the whole organization</div>
                </button>
                <button
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, scope: "own_team" }))}
                  className={`flex-1 rounded-lg border p-3 text-left text-sm ${form.scope === "own_team" ? "border-primary bg-primary-soft text-ink" : "border-line text-ink-soft"}`}
                >
                  <div className="font-medium">Own team only</div>
                  <div className="text-xs text-ink-faint">Same restriction as Team Lead — only their own team's data</div>
                </button>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-xs font-medium text-ink-soft">Capabilities</label>
              {catalog?.map((group) => {
                const groupKeys = group.capabilities.map((c) => c.key);
                const allSelected = groupKeys.length > 0 && groupKeys.every((k) => form.capabilities.includes(k));
                const someSelected = groupKeys.some((k) => form.capabilities.includes(k));
                return (
                  <div key={group.group} className="rounded-lg border border-line p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">{group.group}</span>
                      <button
                        type="button"
                        onClick={() => toggleGroup(groupKeys, allSelected)}
                        className="text-xs text-primary"
                      >
                        {allSelected ? "Clear all" : someSelected ? "Select all" : "Select all"}
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {group.capabilities.map((cap) => (
                        <label key={cap.key} className="flex items-center gap-2 text-sm text-ink-soft">
                          <input
                            type="checkbox"
                            checked={form.capabilities.includes(cap.key)}
                            onChange={() => toggleCapability(cap.key)}
                            className="h-4 w-4 rounded border-line"
                          />
                          {cap.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!catalog && <p className="text-sm text-ink-faint">Loading capabilities…</p>}
            </div>

            {mutation.isError && (
              <p className="text-sm text-danger">
                {mutation.error instanceof ApiError ? mutation.error.message : "Something went wrong — try again."}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={mutation.isPending}>
                {editing ? "Save changes" : "Create role"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

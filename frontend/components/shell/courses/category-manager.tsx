"use client";
import { useState } from "react";
import { Plus, Trash2, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/lib/hooks/use-categories";
import type { Category } from "@/lib/types";

const swatches = ["#3D5AFE", "#00C48C", "#FF3B5C", "#FFA000", "#8E24AA", "#00ACC1"];

export function CategoryManager({ categories }: { categories: Category[] }) {
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(swatches[0]);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const submitNew = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    createCategory.mutate({ name: newName.trim(), color: newColor }, { onSuccess: () => setNewName("") });
  };

  return (
    <div className="mb-4 rounded-xl border border-line bg-surface p-4">
      <p className="mb-3 text-xs font-medium text-ink-faint">Manage categories</p>
      <div className="mb-3 flex flex-col gap-1.5">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-paper">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-full" style={{ background: cat.color }} />
            {renamingId === cat.id ? (
              <Input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onBlur={() => {
                  if (renameValue.trim()) updateCategory.mutate({ id: cat.id, name: renameValue.trim(), color: cat.color });
                  setRenamingId(null);
                }}
                onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                className="h-7 flex-1 text-sm"
              />
            ) : (
              <span onClick={() => { setRenamingId(cat.id); setRenameValue(cat.name); }} className="flex-1 cursor-text text-sm text-ink">
                {cat.name}
              </span>
            )}
            <span className="text-xs text-ink-faint">{cat.course_count} courses</span>
            <button
              onClick={() => {
                if (confirm(`Delete "${cat.name}"? Its courses move to Uncategorized.`)) deleteCategory.mutate(cat.id);
              }}
            >
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </button>
          </div>
        ))}
        {categories.length === 0 && <p className="px-2 text-xs text-ink-faint">No categories yet.</p>}
      </div>

      <form onSubmit={submitNew} className="flex items-center gap-2">
        <div className="flex gap-1">
          {swatches.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setNewColor(c)}
              className="flex h-5 w-5 items-center justify-center rounded-full"
              style={{ background: c }}
            >
              {newColor === c && <Check className="h-3 w-3 text-white" />}
            </button>
          ))}
        </div>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" className="h-8 flex-1 text-sm" />
        <Button type="submit" size="sm" disabled={createCategory.isPending}>
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </form>
    </div>
  );
}

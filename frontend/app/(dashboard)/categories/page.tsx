"use client";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCategories, useCreateCategory, useUpdateCategory, useDeleteCategory } from "@/lib/hooks/use-categories";

const colorChoices = ["#3D5AFE", "#8C54FF", "#00B8D9", "#FF8A00", "#00C48C", "#FF3B5C"];

export default function CategoriesPage() {
  const { data: categories, isLoading } = useCategories();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const del = useDeleteCategory();
  const [name, setName] = useState("");
  const [color, setColor] = useState(colorChoices[0]);

  return (
    <div className="p-8 max-w-xl">
      <h1 className="font-head text-xl text-ink mb-2">Course Categories</h1>
      <p className="text-sm text-ink-faint mb-6">
        Standalone for now — nests back under Courses once the full course-authoring UI exists.
      </p>

      <form
        onSubmit={(e) => { e.preventDefault(); if (!name.trim()) return; create.mutate({ name: name.trim(), color }, { onSuccess: () => setName("") }); }}
        className="mb-6 flex items-center gap-2"
      >
        <Input placeholder="Category name" value={name} onChange={(e) => setName(e.target.value)} className="max-w-xs" />
        <div className="flex gap-1">
          {colorChoices.map((c) => (
            <button key={c} type="button" onClick={() => setColor(c)}
              className="h-5 w-5 rounded-full border-2"
              style={{ background: c, borderColor: color === c ? "#14142B" : "transparent" }} />
          ))}
        </div>
        <Button type="submit" disabled={create.isPending}><Plus className="h-4 w-4" /> Add</Button>
      </form>

      {isLoading && <p className="text-sm text-ink-faint">Loading…</p>}

      <div className="flex flex-col gap-2">
        {categories?.map((cat) => (
          <div key={cat.id} className="flex items-center gap-3 rounded-lg border border-line bg-surface p-3">
            <span className="h-3 w-3 rounded-full" style={{ background: cat.color }} />
            <span className="flex-1 text-sm text-ink">{cat.name}</span>
            <span className="text-xs text-ink-faint">{cat.course_count} courses</span>
            <button onClick={() => { const n = prompt("Rename category", cat.name); if (n) update.mutate({ id: cat.id, name: n, color: cat.color }); }}>
              <Pencil className="h-3.5 w-3.5 text-ink-faint" />
            </button>
            <button onClick={() => { if (confirm(`Delete "${cat.name}"? Its courses become Uncategorized.`)) del.mutate(cat.id); }}>
              <Trash2 className="h-3.5 w-3.5 text-danger" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

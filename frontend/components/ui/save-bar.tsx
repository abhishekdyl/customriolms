"use client";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The one shared Save/Cancel bar for every settings-style section —
 * pair it with useDraft (lib/hooks/use-draft.ts). Renders nothing while
 * there's nothing unsaved, so a page that's never been touched looks
 * exactly as it always did; the moment any field changes, this appears
 * and nothing reaches the server until Save is clicked here. */
export function SaveBar({
  dirty, saving, error, onSave, onCancel, className, savedFlash,
}: {
  dirty: boolean;
  saving?: boolean;
  error?: string | null;
  onSave: () => void;
  onCancel: () => void;
  className?: string;
  /** Shows a brief "Saved" confirmation even after dirty goes back to
   * false (the caller flips this on success and clears it after ~2s). */
  savedFlash?: boolean;
}) {
  if (!dirty && !savedFlash) return null;
  return (
    <div
      className={cn(
        "sticky bottom-0 z-10 -mx-4 mt-4 flex items-center gap-3 border-t border-line bg-surface px-4 py-3",
        "shadow-[0_-4px_12px_rgba(0,0,0,0.05)]",
        className,
      )}
    >
      {dirty ? (
        <span className="text-xs text-ink-soft">You have unsaved changes.</span>
      ) : (
        <span className="text-xs text-success">Saved.</span>
      )}
      {error && <span className="text-xs text-danger">{error}</span>}
      {dirty && (
        <div className="ml-auto flex items-center gap-2">
          <button type="button" onClick={onCancel} disabled={saving} className="text-xs text-ink-faint disabled:opacity-50">
            Cancel
          </button>
          <Button size="sm" onClick={onSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      )}
    </div>
  );
}

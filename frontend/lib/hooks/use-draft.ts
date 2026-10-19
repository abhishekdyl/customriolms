"use client";
import { useEffect, useRef, useState } from "react";

/** The one shared "nothing reaches the server until Save" pattern — used
 * by every settings-style page (course settings, course completion
 * rules, module settings, question bank questions, user roles, org
 * settings, ...) so a field edit, however small, only lands locally
 * until the admin explicitly clicks Save, and Cancel always discards
 * back to the last value the server actually returned.
 *
 * Seeds `draft` from `serverValue` and keeps it in sync with the server
 * — but only while the draft isn't dirty, so a background refetch
 * (another admin's edit, an unrelated mutation's cache invalidation,
 * React Query's own refetch-on-focus) never clobbers an edit that's
 * still sitting unsaved in the form. Call `cancel()` to explicitly throw
 * the local edits away and re-sync with the server now; a successful
 * Save's own query invalidation re-syncs automatically since the draft
 * becomes non-dirty (equal to the server) the instant the save lands. */
export function useDraft<T>(
  serverValue: T | undefined,
  isEqual: (a: T, b: T) => boolean = (a, b) => JSON.stringify(a) === JSON.stringify(b),
) {
  const [draft, setDraftRaw] = useState<T | undefined>(serverValue);
  const dirtyRef = useRef(false);

  // Only auto-sync from the server while there's nothing unsaved to lose.
  useEffect(() => {
    if (serverValue === undefined) return;
    if (!dirtyRef.current) setDraftRaw(serverValue);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverValue]);

  const dirty = draft !== undefined && serverValue !== undefined && !isEqual(draft, serverValue);
  dirtyRef.current = dirty;

  function setDraft(next: T | ((prev: T) => T)) {
    setDraftRaw((prev) => {
      const base = prev ?? (serverValue as T);
      return typeof next === "function" ? (next as (p: T) => T)(base) : next;
    });
  }

  function cancel() {
    if (serverValue !== undefined) setDraftRaw(serverValue);
  }

  return { draft, setDraft, dirty, cancel };
}

/**
 * A tiny module-level store for the debug bar (see components/shell/
 * debug-bar.tsx) — not React state, because it's fed from places that
 * aren't components (TanStack Query's global onError, window.onerror),
 * and a plain external store with useSyncExternalStore is the
 * lightest way to bridge that into a component without pulling in a
 * state library just for this. Capped so a chatty page can't leak
 * memory; DebugBar also clears it on every route change so what's shown
 * is always "what went wrong on THIS page", same as Moodle's debug
 * messages.
 */
export type DebugEntry = {
  id: string;
  level: "error" | "warning";
  message: string;
  detail?: string;
};

const MAX_ENTRIES = 20;
let entries: DebugEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

export function pushDebugEntry(entry: Omit<DebugEntry, "id">) {
  // Same failure logged twice in a row (e.g. a query retried once and
  // failed the same way) shouldn't duplicate the line.
  const id = `${entry.level}:${entry.message}:${entry.detail ?? ""}`;
  if (entries.some((e) => e.id === id)) return;
  entries = [...entries, { ...entry, id }].slice(-MAX_ENTRIES);
  notify();
}

export function clearDebugEntries() {
  if (entries.length === 0) return;
  entries = [];
  notify();
}

export function getDebugEntries(): DebugEntry[] {
  return entries;
}

export function subscribeDebugEntries(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

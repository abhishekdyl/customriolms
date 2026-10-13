import { Construction } from "lucide-react";

/**
 * Deliberately not a fully-designed placeholder: this is the honest
 * "the backend for this module doesn't exist yet" state, per the
 * vertical-slice sequencing agreed in docs/architecture.md — frontend
 * for a module gets built once its API does, not before.
 */
export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <Construction className="mb-4 h-8 w-8 text-ink-faint" />
      <h1 className="font-head text-lg text-ink mb-1.5">{title}</h1>
      <p className="max-w-sm text-sm text-ink-faint">{note}</p>
    </div>
  );
}

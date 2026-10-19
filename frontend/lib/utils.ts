import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

// The standard shadcn/ui helper — every ui/* component imports this.
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Date/time helpers for <input type="datetime-local">, which has no
// timezone of its own — the browser means its value in the viewer's own
// local time, never UTC.

/** Right now, rounded to the minute, as a datetime-local value — used
 * both as a sensible default and as a `min` attribute so the browser
 * can't even offer a past moment (the backend rejects it either way). */
export function nowLocal(): string {
  const d = new Date();
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

/** A datetime-local value -> the real UTC instant it represents, as an
 * ISO string the backend can parse. `new Date(local)` parses the
 * no-timezone string as local time (same assumption the input itself
 * makes), so toISOString() on it is the correct UTC conversion — sending
 * the local digits as if they were already UTC would be off by the
 * viewer's own offset. */
export function localToIso(local: string): string {
  return new Date(local).toISOString();
}

/** The reverse of localToIso — a server ISO datetime (UTC) -> the
 * datetime-local value that displays the same real moment in the
 * viewer's own local time. Null/empty in, empty string out (an unset
 * date just shows an empty field). */
export function isoToLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

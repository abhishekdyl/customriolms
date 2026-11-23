"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ExternalLink, Video } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { useMyCalendar } from "@/lib/hooks/use-courses";
import { useJoinLiveClass, useMyLiveClasses } from "@/lib/hooks/use-live-classes";
import type { CalendarItem, LiveClass } from "@/lib/types";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Every calendar cell for a 6-row month grid — the trailing/leading
 * days from the adjacent months fill the grid but render dimmed and
 * aren't clickable targets for "today"/overdue styling. */
function buildMonthGrid(year: number, month: number): { date: Date; inMonth: boolean }[] {
  const first = new Date(year, month, 1);
  const startOffset = first.getDay(); // 0=Sun
  const gridStart = new Date(year, month, 1 - startOffset);
  return Array.from({ length: 42 }, (_, i) => {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    return { date, inMonth: date.getMonth() === month };
  });
}

const DAY_MS_ = 24 * 60 * 60 * 1000;

/** How urgent this item is right now, in both a short human label and a
 * color tone — this is the whole point of a due-date view, so it gets
 * computed precisely rather than just showing the raw date.
 *
 * Uses calendar-day difference (not exact 24h blocks) for the headline,
 * so a due date 26 hours out reads as "Due tomorrow" rather than the
 * more technically-correct but confusing "Due in 2 days". */
function dueStatus(item: CalendarItem, now: Date): { label: string; tone: "danger" | "warning" | "success" | "muted" } {
  if (item.completed) return { label: "Completed", tone: "success" };
  if (!item.due_at) return { label: "No due date", tone: "muted" };
  const due = new Date(item.due_at);
  const diffMs = due.getTime() - now.getTime();
  const calendarDiffDays = Math.round((startOfDay(due).getTime() - startOfDay(now).getTime()) / DAY_MS_);

  if (diffMs < 0) {
    if (calendarDiffDays === 0) return { label: `Overdue by ${Math.max(1, Math.round(-diffMs / (60 * 60 * 1000)))}h`, tone: "danger" };
    const overdueDays = Math.abs(calendarDiffDays);
    return { label: `Overdue by ${overdueDays} day${overdueDays === 1 ? "" : "s"}`, tone: "danger" };
  }
  if (calendarDiffDays === 0) return { label: `Due today, ${Math.max(1, Math.round(diffMs / (60 * 60 * 1000)))}h left`, tone: "warning" };
  if (calendarDiffDays === 1) return { label: "Due tomorrow", tone: "warning" };
  return { label: `Due in ${calendarDiffDays} days`, tone: "warning" };
}

const TONE_CLASSES: Record<string, string> = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-amber-soft text-amber",
  success: "bg-success-soft text-success",
  muted: "bg-line-soft text-ink-faint",
};

/** A full detail card for one assigned course due on the selected date
 * — not just a link to the course, but everything relevant to the due
 * date itself: how overdue/how much time is left, the exact due and
 * open dates, and current progress. */
function EventCard({ item, now }: { item: CalendarItem; now: Date }) {
  const router = useRouter();
  const { org } = useParams<{ org: string }>();
  const status = dueStatus(item, now);
  return (
    <button
      type="button"
      onClick={() => router.push(`/${org}/learn/courses/${item.course_id}`)}
      className="flex w-full flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-3 text-left hover:bg-paper"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium text-ink">{item.title}</p>
        <span className={cn("flex-shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium", TONE_CLASSES[status.tone])}>
          {status.label}
        </span>
      </div>

      <div className="flex flex-col gap-1 text-[11px] text-ink-faint">
        <div className="flex justify-between">
          <span>Due</span>
          <span className="text-ink-soft">
            {item.due_at ? new Date(item.due_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "Not set"}
          </span>
        </div>
        {item.opens_at && (
          <div className="flex justify-between">
            <span>Opens</span>
            <span className="text-ink-soft">{new Date(item.opens_at).toLocaleDateString(undefined, { dateStyle: "medium" })}</span>
          </div>
        )}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-ink-faint">Progress</span>
          <span className="font-medium text-ink-soft">{item.progress_pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-line-soft">
          <div
            className={cn("h-full rounded-full", item.completed ? "bg-success" : "bg-primary")}
            style={{ width: `${item.progress_pct}%` }}
          />
        </div>
      </div>

      <span className="self-end text-[10.5px] font-medium text-primary">Open course →</span>
    </button>
  );
}

/** One live-class on the selected date — a Join/Start button instead of
 * a link to a course, since there's nothing else to "open". */
function LiveClassCard({ lc }: { lc: LiveClass }) {
  const join = useJoinLiveClass();
  const ended = lc.status === "ended";
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-line bg-surface px-3 py-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-1.5">
          <Video className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-primary" />
          <p className="min-w-0 truncate text-sm font-medium text-ink">{lc.title}</p>
        </div>
        <span className={cn(
          "flex-shrink-0 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-medium",
          lc.status === "live" ? "bg-success-soft text-success" : ended ? "bg-line-soft text-ink-faint" : "bg-amber-soft text-amber",
        )}>
          {lc.status === "live" ? "Live now" : ended ? "Ended" : "Scheduled"}
        </span>
      </div>
      <p className="text-[11px] text-ink-faint">
        {new Date(lc.scheduled_start).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} · {lc.duration_minutes} min
      </p>
      {!ended && (
        <button
          type="button" disabled={join.isPending}
          onClick={() => join.mutate(lc.id, { onSuccess: (r) => window.open(r.join_url, "_blank") })}
          className="flex items-center justify-center gap-1.5 self-start rounded-md bg-primary px-2.5 py-1.5 text-[11.5px] font-medium text-white disabled:opacity-60"
        >
          <ExternalLink className="h-3 w-3" /> {join.isPending ? "Opening…" : "Join"}
        </button>
      )}
      {ended && lc.recording_url && (
        <a href={lc.recording_url} target="_blank" rel="noreferrer" className="self-start text-[11.5px] font-medium text-primary">
          View recording
        </a>
      )}
      {join.isError && <p className="text-[11px] text-danger">Couldn&apos;t get a join link — it may not have started yet.</p>}
    </div>
  );
}

/** The learner's own Calendar — a real month grid (not just lists):
 * every date with something due gets a colored dot (red = overdue,
 * amber = today, primary = upcoming), and clicking a date shows exactly
 * what's due that day below the grid. Lives under [org]/(learner)/learn/*
 * like every other learner page — a learner never reaches the
 * [org]/(dashboard) route group (AuthGuard bounces them via roleHome()). */
export default function CalendarPage() {
  const { data, isLoading } = useMyCalendar();
  const { data: liveClasses } = useMyLiveClasses();
  const now = new Date();
  const today = startOfDay(now);
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState<Date>(today);

  // Every due item, grouped by the calendar day it falls on.
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of data ?? []) {
      if (!item.due_at) continue;
      const key = dateKey(startOfDay(new Date(item.due_at)));
      map.set(key, [...(map.get(key) ?? []), item]);
    }
    return map;
  }, [data]);

  // Live classes this user can see, grouped the same way — kept separate
  // from byDate (different shape entirely) and merged only for the dot
  // and the selected-day list below.
  const liveByDate = useMemo(() => {
    const map = new Map<string, LiveClass[]>();
    for (const lc of liveClasses ?? []) {
      const key = dateKey(startOfDay(new Date(lc.scheduled_start)));
      map.set(key, [...(map.get(key) ?? []), lc]);
    }
    return map;
  }, [liveClasses]);

  const noDueDate = (data ?? []).filter((i) => !i.due_at && !i.completed);
  const overdueCount = (data ?? []).filter((i) => i.due_at && !i.completed && new Date(i.due_at) < today).length;

  const grid = useMemo(() => buildMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);
  const selectedItems = byDate.get(dateKey(selected)) ?? [];
  const selectedLiveClasses = liveByDate.get(dateKey(selected)) ?? [];
  const monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function dotColor(d: Date, items: CalendarItem[]): string | null {
    if (items.length === 0) return null;
    const anyOverdue = items.some((i) => !i.completed && startOfDay(d) < today);
    const allDone = items.every((i) => i.completed);
    if (allDone) return "bg-success";
    if (anyOverdue) return "bg-danger";
    if (startOfDay(d).getTime() === today.getTime()) return "bg-amber";
    return "bg-primary";
  }

  return (
    <>
      <Topbar title="Calendar" />
      <div className="mx-auto w-full max-w-[1080px] flex-1 px-4 pb-6 pt-3 md:px-8 md:pt-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="max-w-[500px] text-[11.5px] text-ink-faint">
            Every assigned course, by when it&apos;s due — your own due date if your admin set one, otherwise the
            course&apos;s own close date. {overdueCount > 0 && (
              <span className="font-medium text-danger"> {overdueCount} overdue.</span>
            )}
          </p>
        </div>

        {isLoading && <p className="text-xs text-ink-faint">Loading…</p>}

        {!isLoading && (
          <div className="flex flex-col gap-5 md:flex-row">
            {/* Month grid */}
            <div className="flex-1 rounded-xl border border-line bg-surface p-4">
              <div className="mb-3 flex items-center justify-between">
                <p className="font-head text-[15px] text-ink">{monthLabel}</p>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
                    className="rounded-md border border-line p-1 text-ink-soft hover:bg-paper"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setCursor(new Date(today.getFullYear(), today.getMonth(), 1)); setSelected(today); }}
                    className="rounded-md border border-line px-2 py-1 text-[11px] text-ink-soft hover:bg-paper"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    onClick={() => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
                    className="rounded-md border border-line p-1 text-ink-soft hover:bg-paper"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {WEEKDAYS.map((w) => (
                  <div key={w} className="py-1 text-center text-[10px] font-medium text-ink-faint">{w}</div>
                ))}
                {grid.map(({ date, inMonth }) => {
                  const items = byDate.get(dateKey(date)) ?? [];
                  const dot = dotColor(date, items);
                  const hasLive = (liveByDate.get(dateKey(date)) ?? []).length > 0;
                  const isToday = startOfDay(date).getTime() === today.getTime();
                  const isSelected = startOfDay(date).getTime() === startOfDay(selected).getTime();
                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => setSelected(date)}
                      className={cn(
                        "flex aspect-square flex-col items-center justify-center gap-0.5 rounded-md border text-[12px]",
                        inMonth ? "text-ink" : "text-ink-faint/50",
                        isSelected ? "border-ink bg-ink text-white" : isToday ? "border-primary" : "border-transparent hover:bg-paper",
                      )}
                    >
                      <span>{date.getDate()}</span>
                      <span className="flex items-center gap-0.5">
                        {dot && <span className={cn("h-1.5 w-1.5 rounded-full", isSelected ? "bg-white" : dot)} />}
                        {hasLive && <Video className={cn("h-2.5 w-2.5", isSelected ? "text-white" : "text-success")} />}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected day's detail */}
            <div className="flex w-full flex-col gap-3 md:w-[300px]">
              <p className="text-xs font-medium text-ink-faint">
                {selected.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
              </p>
              {selectedLiveClasses.length > 0 && (
                <div className="flex flex-col gap-2">
                  {selectedLiveClasses.map((lc) => <LiveClassCard key={lc.id} lc={lc} />)}
                </div>
              )}

              {selectedItems.length === 0 && selectedLiveClasses.length === 0 ? (
                <p className="text-[11.5px] text-ink-faint">Nothing due on this date.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {selectedItems.map((i) => <EventCard key={i.course_id} item={i} now={now} />)}
                </div>
              )}

              {noDueDate.length > 0 && (
                <div className="mt-3">
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-ink-faint">
                    <AlertTriangle className="h-3.5 w-3.5" /> No due date set
                  </p>
                  <div className="flex flex-col gap-2">
                    {noDueDate.map((i) => <EventCard key={i.course_id} item={i} now={now} />)}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

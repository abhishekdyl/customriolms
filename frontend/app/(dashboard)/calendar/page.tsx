"use client";

import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, Clock, AlertTriangle } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { useMyCalendar } from "@/lib/hooks/use-courses";
import type { CalendarItem } from "@/lib/types";

const DAY_MS = 24 * 60 * 60 * 1000;

function bucketFor(item: CalendarItem, now: Date): "overdue" | "today" | "week" | "later" | "none" {
  if (!item.due_at) return "none";
  if (item.completed) return "later"; // done items never need urgency, but still show in "later" so they don't vanish
  const due = new Date(item.due_at);
  const diffDays = (due.getTime() - now.getTime()) / DAY_MS;
  if (diffDays < 0) return "overdue";
  if (diffDays < 1) return "today";
  if (diffDays < 7) return "week";
  return "later";
}

function CourseRow({ item }: { item: CalendarItem }) {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.push(`/courses/${item.course_id}`)}
      className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left hover:bg-paper"
    >
      <div className="min-w-0">
        <p className="truncate text-sm text-ink">{item.title}</p>
        <p className="text-[11px] text-ink-faint">
          {item.due_at ? `Due ${new Date(item.due_at).toLocaleString()}` : "No due date"}
        </p>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <span className="text-xs text-ink-soft">{item.progress_pct}%</span>
        {item.completed && <CheckCircle2 className="h-4 w-4 text-success" />}
      </div>
    </button>
  );
}

function Section({ title, icon: Icon, items, emptyLabel, tone }: {
  title: string; icon: typeof Clock; items: CalendarItem[]; emptyLabel: string; tone?: "danger" | "default";
}) {
  return (
    <div className="mb-5">
      <div className={`mb-2 flex items-center gap-1.5 text-xs font-medium ${tone === "danger" ? "text-danger" : "text-ink-faint"}`}>
        <Icon className="h-3.5 w-3.5" /> {title} {items.length > 0 && `(${items.length})`}
      </div>
      {items.length === 0 ? (
        <p className="text-[11.5px] text-ink-faint">{emptyLabel}</p>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map((i) => <CourseRow key={i.course_id} item={i} />)}
        </div>
      )}
    </div>
  );
}

/** The learner's own "what's due this week" view across every assigned
 * course — their effective due date (a personal override if an admin
 * set one, else the course's own closes_at). Buckets by urgency rather
 * than a full month grid, since a learner's real question is "what do
 * I need to do soon", not "what's the date today". */
export default function CalendarPage() {
  const { data, isLoading } = useMyCalendar();
  const now = new Date();

  const overdue = (data ?? []).filter((i) => bucketFor(i, now) === "overdue");
  const today = (data ?? []).filter((i) => bucketFor(i, now) === "today");
  const week = (data ?? []).filter((i) => bucketFor(i, now) === "week");
  const later = (data ?? []).filter((i) => bucketFor(i, now) === "later" && !i.completed);
  const noDue = (data ?? []).filter((i) => bucketFor(i, now) === "none" && !i.completed);
  const done = (data ?? []).filter((i) => i.completed);

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col">
      <Topbar title="Calendar" />
      <div className="flex-1 overflow-auto p-5 md:p-8">
        <p className="mb-5 max-w-[640px] text-[11.5px] text-ink-faint">
          Every course assigned to you, by when it&apos;s due — your own due date if your admin set one, otherwise
          the course&apos;s own close date.
        </p>

        {isLoading && <p className="text-xs text-ink-faint">Loading…</p>}

        {!isLoading && (data?.length ?? 0) === 0 && (
          <p className="text-xs text-ink-faint">
            <CalendarDays className="mr-1 inline h-3.5 w-3.5" /> Nothing assigned to you yet.
          </p>
        )}

        {!isLoading && (data?.length ?? 0) > 0 && (
          <>
            <Section title="Overdue" icon={AlertTriangle} items={overdue} emptyLabel="Nothing overdue — nice." tone="danger" />
            <Section title="Due today" icon={Clock} items={today} emptyLabel="Nothing due today." />
            <Section title="Due this week" icon={CalendarDays} items={week} emptyLabel="Nothing due in the next 7 days." />
            <Section title="Later / no rush" icon={CalendarDays} items={[...later, ...noDue]} emptyLabel="Nothing further out." />
            {done.length > 0 && <Section title="Completed" icon={CheckCircle2} items={done} emptyLabel="" />}
          </>
        )}
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import { Bell, ChevronRight, Flame, MessageCircleQuestion, Sparkles } from "lucide-react";
import { CourseCard } from "@/components/learner/course-card";
import { useCurrentUser } from "@/lib/hooks/use-auth";
import { useMyCourses } from "@/lib/hooks/use-my-courses";
import { cn } from "@/lib/utils";
import type { MyCourse } from "@/lib/types";

// TODO: the weekly streak needs login/activity tracking, which doesn't
// exist in the backend yet. Static for now so the layout matches the
// prototype; swap for a real endpoint once activity is recorded.
const WEEK = { trained: 3, of: 5, streak: 7, days: ["M", "T", "W", "T", "F"] };

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function StreakCard() {
  return (
    <div
      className="h-full rounded-[14px] p-4"
      style={{ background: "linear-gradient(135deg, var(--color-primary), #7B4DFF)" }}
    >
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[11.5px] text-white/70">This week</div>
          <div className="font-head text-[17px] text-white">
            {WEEK.trained} of {WEEK.of} days trained
          </div>
        </div>
        <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1.5">
          <Flame size={13} color="#FFD37A" />
          <span className="text-[12.5px] font-semibold text-white">{WEEK.streak}</span>
        </div>
      </div>
      <div className="flex gap-1.5">
        {WEEK.days.map((d, i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div className={cn("h-[5px] w-full rounded-[3px]", i < WEEK.trained ? "bg-[#FFD37A]" : "bg-white/22")} />
            <span className="text-[10px] text-white/65">{d}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function NudgeCard({ course }: { course: MyCourse }) {
  const started = course.progress_pct > 0;
  const href = `/learn/courses/${course.id}`;
  return (
    <>
      {/* phones: compact horizontal bar */}
      <Link
        href={href}
        className="flex w-full items-center gap-3 rounded-xl bg-primary-soft px-4 py-3.5 active:opacity-80 md:hidden"
      >
        <div className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[9px] bg-primary">
          <Sparkles size={16} color="#fff" />
        </div>
        <span className="flex-1 text-[12.5px] leading-snug text-ink">
          {started ? "Pick up" : "Start"} <strong>{course.title}</strong> — {course.module_count} modules
        </span>
        <ChevronRight size={16} color="var(--color-primary)" />
      </Link>

      {/* tablet / desktop: tall card */}
      <Link
        href={href}
        className="hidden h-full w-full flex-col justify-between rounded-[14px] bg-primary-soft p-4 text-left active:opacity-80 md:flex"
      >
        <div>
          <div className="mb-2.5 flex h-[34px] w-[34px] items-center justify-center rounded-[9px] bg-primary">
            <Sparkles size={16} color="#fff" />
          </div>
          <div className="text-[11.5px] text-ink-soft">
            {started ? "Pick up where you left off" : "Start your next course"}
          </div>
          <div className="mt-0.5 font-head text-[15px] text-ink">{course.title}</div>
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <span className="text-xs font-semibold text-primary">{started ? "Resume" : "Start"}</span>
          <ChevronRight size={14} color="var(--color-primary)" />
        </div>
      </Link>
    </>
  );
}

function StatCard({ assigned, inProgress }: { assigned: number; inProgress: number }) {
  return (
    <div className="flex h-full flex-col justify-between rounded-[14px] border border-line bg-surface p-4">
      <div className="text-[11.5px] text-ink-soft">Assigned to you</div>
      <div>
        <div className="font-head text-[26px] text-ink">{assigned}</div>
        <div className="text-[11.5px] text-ink-faint">{inProgress} in progress</div>
      </div>
    </div>
  );
}

export default function LearnerHomePage() {
  const { data: user } = useCurrentUser();
  const { data: courses, isLoading, isError } = useMyCourses();

  const assigned = courses ?? [];
  const inProgress = assigned.filter((c) => c.progress_pct < 100);
  // "In progress" means actually started — a course at 0% is assigned, not in progress.
  const startedCount = assigned.filter((c) => c.progress_pct > 0 && c.progress_pct < 100).length;
  const nudge = [...inProgress].sort((a, b) => b.progress_pct - a.progress_pct)[0];

  return (
    <div className="mx-auto w-full max-w-[1080px] flex-1 px-4 pb-24 pt-3 md:px-8 md:pb-4 md:pt-6">
      {/* header: greeting + bell */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <div className="text-[12.5px] text-ink-faint">{greeting()}</div>
          <div className="font-head text-[20px] text-ink md:text-[24px]">{user?.full_name ?? "\u00A0"}</div>
        </div>
        <Link href="/learn/notifications" className="relative active:opacity-60" aria-label="Notifications">
          <Bell size={20} color="var(--color-ink)" />
          <div className="absolute -right-px -top-px h-[7px] w-[7px] rounded-full border-[1.5px] border-paper bg-danger" />
        </Link>
      </div>

      {/* top row: streak / nudge / assigned */}
      <div className="mb-6 grid gap-4 md:grid-cols-[1.4fr_1fr_0.8fr]">
        <StreakCard />
        {nudge ? <NudgeCard course={nudge} /> : <div className="hidden md:block" />}
        <div className="hidden md:block">
          <StatCard assigned={assigned.length} inProgress={startedCount} />
        </div>
      </div>

      {/* continue learning */}
      <div className="mb-3 flex items-center justify-between">
        <span className="font-head text-[14.5px] text-ink md:text-[17px]">Continue learning</span>
        <span className="text-xs text-ink-faint">{inProgress.length} active</span>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-[88px] animate-pulse rounded-[14px] bg-line-soft md:h-[160px]" />
          ))}
        </div>
      )}

      {isError && <p className="text-[13px] text-danger">Couldn’t load your courses. Please refresh.</p>}

      {!isLoading && !isError && assigned.length === 0 && (
        <div className="rounded-[14px] border border-line bg-surface p-6 text-center">
          <div className="font-head text-[14.5px] text-ink">No courses assigned yet</div>
          <p className="mt-1 text-[12.5px] text-ink-faint">
            When your team lead or admin assigns you a course, it will show up here.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {assigned.map((c, i) => (
          <CourseCard
            key={c.id}
            course={c}
            index={i}
            subtitle={c.progress_pct >= 100 ? "Completed" : `${c.module_count} modules`}
          />
        ))}
      </div>

      {/* floating "Ask AI" — page for it comes with the AI tutor backend */}
      <Link
        href="/learn/chat"
        className="fixed bottom-[84px] right-6 z-10 flex items-center gap-2 rounded-3xl bg-ink px-4 py-3 shadow-[0_8px_20px_rgba(20,20,43,0.3)] transition-transform active:scale-95 md:bottom-6"
      >
        <MessageCircleQuestion size={16} color="#fff" />
        <span className="text-[12.5px] font-medium text-white">Ask AI</span>
      </Link>
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, BookOpen, CheckCircle2, Circle, HelpCircle, PlayCircle, Sparkles } from "lucide-react";
import { useMyCourse } from "@/lib/hooks/use-my-courses";
import { MODULE_TYPE_LABEL } from "@/lib/learner-courses";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "content", label: "Modules", icon: BookOpen },
  { id: "summary", label: "AI summary", icon: Sparkles },
  { id: "quiz", label: "Quiz", icon: HelpCircle },
] as const;
type TabId = (typeof TABS)[number]["id"];

function BackLink({ label }: { label: string }) {
  return (
    <Link href="/learn/courses" className="flex items-center gap-1.5">
      <ArrowLeft size={14} color="var(--color-ink-soft)" />
      <span className="text-[12.5px] text-ink-soft">{label}</span>
    </Link>
  );
}

export default function CourseViewPage() {
  const { id } = useParams<{ id: string }>();
  const { data: course, isLoading, isError } = useMyCourse(id);
  const [tab, setTab] = useState<TabId>("content");

  if (isLoading) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-3 md:px-0">
        <div className="mb-3 h-4 w-40 animate-pulse rounded bg-line-soft" />
        <div className="h-[190px] animate-pulse rounded-lg bg-line-soft" />
      </div>
    );
  }

  if (isError || !course) {
    return (
      <div className="mx-auto w-full max-w-[1080px] px-4 py-3 md:px-0">
        <BackLink label="My Courses" />
        <p className="mt-6 text-[13px] text-ink-faint">
          This course couldn’t be found, or it hasn’t been assigned to you.
        </p>
      </div>
    );
  }

  const mods = course.modules;
  const quizModule = mods.find((m) => m.type === "quiz" && m.questions.length > 0);

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-[1080px] flex-1 flex-col">
      <div className="flex items-center gap-2 px-4 py-3 md:px-0">
        <BackLink label={course.title} />
      </div>

      <div className="flex-1 px-4 pb-6 md:px-0">
        {/* video area — static placeholder, same as the prototype, until content playback is wired */}
        <div className="mb-3 flex h-[190px] items-center justify-center rounded-lg bg-ink">
          <PlayCircle size={40} color="rgba(255,255,255,0.6)" />
        </div>

        <div className="flex border-b border-line-soft">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 border-b-2 py-2.5",
                tab === t.id ? "border-primary" : "border-transparent"
              )}
            >
              <t.icon size={13} color={tab === t.id ? "var(--color-primary)" : "var(--color-ink-faint)"} />
              <span className={cn("text-xs", tab === t.id ? "text-ink" : "text-ink-faint")}>{t.label}</span>
            </button>
          ))}
        </div>

        <div className="py-4">
          {tab === "content" && (
            <div className="flex flex-col gap-0.5">
              {mods.map((m) => (
                <div key={m.id} className="flex items-center gap-3 border-b border-line-soft py-3">
                  {m.completed ? (
                    <CheckCircle2 size={18} color="var(--color-success)" />
                  ) : (
                    <Circle size={18} color="var(--color-ink-faint)" />
                  )}
                  <div className="flex-1">
                    <div className="text-[13.5px] text-ink">{m.title}</div>
                    <div className="text-[11px] text-ink-faint">
                      {MODULE_TYPE_LABEL[m.type]}
                      {m.skill_count > 0 && ` · builds ${m.skill_count} skill${m.skill_count > 1 ? "s" : ""}`}
                    </div>
                  </div>
                </div>
              ))}
              {mods.length === 0 && (
                <div className="text-[13px] text-ink-faint">No modules published for this course yet.</div>
              )}
            </div>
          )}

          {tab === "summary" && (
            <div className="flex items-center gap-2 rounded-lg bg-primary-soft px-4 py-6">
              <Sparkles size={14} color="var(--color-primary)" />
              <span className="text-[12.5px] text-ink">
                AI summary generates once you’ve watched this module’s content.
              </span>
            </div>
          )}

          {tab === "quiz" &&
            (quizModule ? (
              <div className="rounded-lg border border-line bg-surface p-4">
                <div className="font-head text-[15px] text-ink">{quizModule.title}</div>
                <div className="mt-1 text-[12.5px] text-ink-soft">
                  {quizModule.questions.length} question{quizModule.questions.length > 1 ? "s" : ""} · pass mark{" "}
                  {quizModule.threshold}%
                </div>
                {/* Questions are loaded, but marking is server-side and attempts aren't built yet. */}
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-primary-soft px-3 py-3">
                  <HelpCircle size={14} color="var(--color-primary)" />
                  <span className="text-[12.5px] text-ink">Taking quizzes unlocks soon.</span>
                </div>
              </div>
            ) : (
              <div className="text-[13px] text-ink-faint">No quiz on this course yet.</div>
            ))}
        </div>
      </div>
    </div>
  );
}

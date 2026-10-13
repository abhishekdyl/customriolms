"use client";

import { useState } from "react";
import { CourseCard } from "@/components/learner/course-card";
import { Topbar } from "@/components/shell/topbar";
import { COURSE_FILTERS, courseStatus, type CourseFilter } from "@/lib/learner-courses";
import { useMyCourses } from "@/lib/hooks/use-my-courses";
import { cn } from "@/lib/utils";

export default function MyCoursesPage() {
  const { data: courses, isLoading, isError } = useMyCourses();
  const [filter, setFilter] = useState<CourseFilter>("All");
  const [search, setSearch] = useState("");

  const q = search.trim().toLowerCase();
  // Keep each course's original index so its cover colour stays the same
  // whichever filter is active.
  const shown = (courses ?? [])
    .map((course, index) => ({ course, index }))
    .filter(({ course }) => filter === "All" || courseStatus(course) === filter)
    .filter(({ course }) => !q || course.title.toLowerCase().includes(q) || (course.category_name ?? "").toLowerCase().includes(q));

  return (
    <>
      <Topbar title="My Courses" search={search} onSearch={setSearch} />

      <div className="mx-auto w-full max-w-[1080px] flex-1 px-4 pb-6 pt-3 md:px-8 md:pt-6">
        <div className="mb-4 flex gap-1.5 overflow-x-auto">
          {COURSE_FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs",
                filter === f ? "border-ink bg-ink text-white" : "border-line bg-transparent text-ink-soft"
              )}
            >
              {f}
            </button>
          ))}
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-[88px] animate-pulse rounded-[14px] bg-line-soft md:h-[176px]" />
            ))}
          </div>
        )}

        {isError && <p className="text-[13px] text-danger">Couldn’t load your courses. Please refresh.</p>}

        {!isLoading && !isError && (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-3">
            {shown.map(({ course, index }) => (
              <CourseCard
                key={course.id}
                course={course}
                index={index}
                subtitle={`${courseStatus(course)} · ${course.module_count} modules`}
                mobileSubtitle={courseStatus(course)}
              />
            ))}
            {shown.length === 0 && (
              <div className="col-span-full py-10 text-center text-[13px] text-ink-faint">
                {(courses ?? []).length === 0 ? "No courses assigned to you yet" : "Nothing here yet"}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

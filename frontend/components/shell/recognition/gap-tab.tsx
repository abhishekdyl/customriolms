"use client";
import { useState } from "react";
import { Target } from "lucide-react";
import { useQueries } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { AssignModal } from "@/components/shell/courses/assign-modal";
import { PageLoader } from "@/components/ui/loading";
import { useCourses } from "@/lib/hooks/use-courses";
import { useSkills } from "@/lib/hooks/use-skills";
import { useTeams } from "@/lib/hooks/use-teams";
import { heatValue } from "@/lib/sample-data";
import type { Course } from "@/lib/types";

export function GapAnalysisTab() {
  const { data: teams = [], isLoading: teamsLoading } = useTeams();
  const { data: skills = [], isLoading: skillsLoading } = useSkills();
  const { data: list = [], isLoading: coursesLoading } = useCourses();
  const [assignCourse, setAssignCourse] = useState<string | null>(null);

  const results = useQueries({
    queries: list.map((c) => ({ queryKey: ["courses", c.id], queryFn: () => api.get<Course>(`/api/v1/courses/${c.id}`) })),
  });
  const courses = results.map((r) => r.data).filter((c): c is Course => !!c);
  const detailsLoading = list.length > 0 && results.some((r) => r.isLoading);

  if (teamsLoading || skillsLoading || coursesLoading || detailsLoading) return <PageLoader />;

  const courseFor = (skillId: string, teamId: string) =>
    courses.find((c) => c.modules.some((m) => m.skill_ids.includes(skillId)) && !c.assigned_team_ids.includes(teamId));

  // Scores are static sample values (same source as the Dashboard heatmap) until progress tracking exists.
  const gaps = teams
    .flatMap((team, ti) =>
      skills.map((skill, si) => ({ team, skill, score: heatValue(ti, si), course: courseFor(skill.id, team.id) })),
    )
    .filter((g) => g.score < 60)
    .sort((a, b) => a.score - b.score);

  return (
    <div className="max-w-[640px]">
      <p className="text-[12.5px] text-ink-faint mb-4">
        Every team/skill combination scoring below 60, ranked worst first, with a course that already has a module tagged for that skill — the same idea behind the &quot;AI insight&quot; callouts on the Dashboard, applied consistently across every team and skill instead of one hand-written example.
      </p>
      {gaps.length === 0 ? (
        <div className="p-6 text-center bg-surface border border-line rounded-[10px] text-[13px] text-ink-faint">
          No gaps below the 60 threshold right now.
        </div>
      ) : (
        <div className="flex flex-col gap-2.5">
          {gaps.map((g) => (
            <div key={g.team.id + g.skill.id} className="flex items-center gap-3 p-4 bg-surface border border-line rounded-[10px]">
              <div className="w-[34px] h-[34px] rounded-[9px] bg-danger-soft shrink-0 flex items-center justify-center">
                <Target size={15} className="text-danger" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] text-ink font-medium">{g.team.name} · {g.skill.name}</div>
                <div className="text-[11.5px] text-ink-faint">
                  Scoring {g.score} ·{" "}
                  {g.course
                    ? `"${g.course.title}" would close most of the gap`
                    : "No course tags this skill yet — tag a module under Courses → Manage → module → Skills"}
                </div>
              </div>
              {g.course && (
                <button type="button" onClick={() => setAssignCourse(g.course!.id)} className="px-3 py-1.5 shrink-0 bg-primary rounded-md text-[11.5px] text-white font-medium">
                  Assign
                </button>
              )}
            </div>
          ))}
        </div>
      )}
      {assignCourse && <AssignModal courseId={assignCourse} onClose={() => setAssignCourse(null)} />}
    </div>
  );
}

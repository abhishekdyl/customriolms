"use client";

import { useState } from "react";
import { Award, BarChart3, CheckCircle2, Download, GraduationCap, Users } from "lucide-react";
import { Topbar } from "@/components/shell/topbar";
import { useReports } from "@/lib/hooks/use-reports";
import type { CoursePerformance } from "@/lib/types";

const RANGE_OPTIONS = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
];

function StatCard({ icon: Icon, label, value, sub }: { icon: typeof Users; label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-ink-faint">
        <Icon className="h-4 w-4" />
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      <p className="text-2xl font-head text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-ink-faint">{sub}</p>}
    </div>
  );
}

/** Tiny dependency-free grouped bar chart for the activity trend — just
 * three CSS-height bars per day, no charting library needed for 7-30 points. */
function TrendChart({ trend }: { trend: { date: string; modules_completed: number; quiz_attempts: number; certificates_issued: number }[] }) {
  const max = Math.max(1, ...trend.flatMap((t) => [t.modules_completed, t.quiz_attempts, t.certificates_issued]));
  return (
    <div className="rounded-xl border border-line bg-surface p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-medium text-ink-faint">Activity (last {trend.length} days)</p>
        <div className="flex gap-3 text-[10.5px] text-ink-faint">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Modules completed</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-500" /> Quiz attempts</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-success" /> Certificates</span>
        </div>
      </div>
      <div className="flex h-32 items-end gap-1.5 overflow-x-auto">
        {trend.map((t) => (
          <div key={t.date} className="flex min-w-[20px] flex-1 flex-col items-center gap-0.5" title={t.date}>
            <div className="flex h-24 w-full items-end justify-center gap-[2px]">
              <div className="w-1.5 rounded-sm bg-primary" style={{ height: `${(t.modules_completed / max) * 100}%` }} />
              <div className="w-1.5 rounded-sm bg-amber-500" style={{ height: `${(t.quiz_attempts / max) * 100}%` }} />
              <div className="w-1.5 rounded-sm bg-success" style={{ height: `${(t.certificates_issued / max) * 100}%` }} />
            </div>
            <span className="text-[9px] text-ink-faint">{t.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function exportCoursesCsv(courses: CoursePerformance[]) {
  const header = ["Course", "Published", "Enrolled", "Completed", "Completion %", "Avg grade", "Pass rate %", "Certificates issued"];
  const rows = courses.map((c) => [
    c.title, c.published ? "Yes" : "Draft", c.enrolled_count, c.completed_count,
    c.completion_pct ?? "", c.avg_grade ?? "", c.pass_rate ?? "", c.certificates_issued,
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `course-performance-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Org-wide (or, for a Team Lead, team-scoped) Reports & Analytics page —
 * headline numbers, a per-course performance table, and a short activity
 * trend, all computed live from real course/module/quiz/certificate data
 * (see report_service.py — nothing here is estimated). */
export default function ReportsPage() {
  const [days, setDays] = useState(14);
  const { data, isLoading } = useReports(days);
  const overview = data?.overview;
  const courses = data?.courses ?? [];

  return (
    <div className="flex h-screen min-w-0 flex-1 flex-col">
      <Topbar title="Reports & Analytics" />
      <div className="flex-1 overflow-auto p-5 md:p-8">
        <div className="mb-5 flex items-center justify-between">
          <p className="max-w-[640px] text-[11.5px] text-ink-faint">
            How the org is actually doing — completion, grades and certificates, computed live from course and quiz
            data. A Team Lead sees only their own team here.
          </p>
          <div className="flex gap-1.5">
            {RANGE_OPTIONS.map((r) => (
              <button
                key={r.value}
                type="button"
                onClick={() => setDays(r.value)}
                className={`rounded-full border px-3 py-1 text-[11.5px] ${
                  days === r.value ? "border-ink bg-ink text-white" : "border-line text-ink-soft"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>

        {isLoading && <p className="text-xs text-ink-faint">Loading…</p>}

        {overview && (
          <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <StatCard icon={Users} label="Learners" value={String(overview.total_learners)} />
            <StatCard icon={BarChart3} label="Published courses" value={String(overview.total_courses)} />
            <StatCard icon={CheckCircle2} label="Avg completion" value={`${overview.avg_completion_pct}%`} sub={`${overview.not_started_pct}% not started`} />
            <StatCard icon={GraduationCap} label="Quiz pass rate" value={overview.quiz_pass_rate === null ? "—" : `${overview.quiz_pass_rate}%`} sub={`${overview.quiz_attempts_total} attempts`} />
            <StatCard icon={Award} label="Certificates issued" value={String(overview.certificates_issued)} />
          </div>
        )}

        {data && (
          <div className="mb-5">
            <TrendChart trend={data.trend} />
          </div>
        )}

        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs font-medium text-ink-faint">Course performance</p>
          {courses.length > 0 && (
            <button
              type="button"
              onClick={() => exportCoursesCsv(courses)}
              className="flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1 text-[11px] text-ink-soft hover:bg-paper"
            >
              <Download className="h-3.5 w-3.5" /> Export CSV
            </button>
          )}
        </div>

        <div className="overflow-hidden rounded-[10px] border border-line">
          <table className="w-full text-left text-[12.5px]">
            <thead>
              <tr className="bg-line-soft text-[11px] text-ink-faint">
                <th className="px-3 py-2 font-medium">Course</th>
                <th className="px-3 py-2 font-medium">Enrolled</th>
                <th className="px-3 py-2 font-medium">Completed</th>
                <th className="px-3 py-2 font-medium">Avg grade</th>
                <th className="px-3 py-2 font-medium">Pass rate</th>
                <th className="px-3 py-2 font-medium">Certificates</th>
              </tr>
            </thead>
            <tbody>
              {!isLoading && !courses.length && (
                <tr><td colSpan={6} className="px-3 py-6 text-center text-ink-faint">No courses to report on yet.</td></tr>
              )}
              {courses.map((c) => (
                <tr key={c.course_id} className="border-t border-line-soft">
                  <td className="px-3 py-2.5 text-ink">
                    {c.title}
                    {!c.published && <span className="ml-1.5 rounded-full bg-line-soft px-1.5 py-0.5 text-[9.5px] text-ink-faint">Draft</span>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">{c.enrolled_count}</td>
                  <td className="px-3 py-2.5 text-ink-soft">
                    {c.completed_count}{c.completion_pct !== null && <span className="ml-1 text-ink-faint">({c.completion_pct}%)</span>}
                  </td>
                  <td className="px-3 py-2.5 text-ink-soft">{c.avg_grade === null ? "—" : `${c.avg_grade}%`}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{c.pass_rate === null ? "—" : `${c.pass_rate}%`}</td>
                  <td className="px-3 py-2.5 text-ink-soft">{c.certificates_issued}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

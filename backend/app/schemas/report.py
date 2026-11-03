from datetime import date

from pydantic import BaseModel


class ReportOverviewOut(BaseModel):
    """Org-wide (or, for a Team Lead, team-scoped) headline numbers for the
    Reports page's top stat row. Every number here is a real count or a
    real average over stored rows — nothing here is estimated, the same
    "don't fake it" rule dashboard_service already follows (see its
    module docstring)."""
    total_learners: int
    total_courses: int  # published courses only — same visibility rule as a learner's own course list
    avg_completion_pct: int  # average, across every (learner, assigned course) pair, of course_progress()
    not_started_pct: int  # % of those same pairs still at 0%
    certificates_issued: int
    quiz_attempts_total: int
    quiz_pass_rate: int | None  # % of quiz attempts with passed=True; None if there have been no attempts yet


class CoursePerformanceOut(BaseModel):
    course_id: str
    title: str
    published: bool
    enrolled_count: int
    completed_count: int
    completion_pct: int | None  # None when nobody's enrolled yet
    avg_grade: int | None  # average weighted Gradebook grade across learners who have at least one graded score
    pass_rate: int | None  # % of those graded learners at/above the course's pass_mark
    certificates_issued: int


class ActivityPointOut(BaseModel):
    date: date
    modules_completed: int
    quiz_attempts: int
    certificates_issued: int


class ReportsOut(BaseModel):
    overview: ReportOverviewOut
    courses: list[CoursePerformanceOut]
    trend: list[ActivityPointOut]

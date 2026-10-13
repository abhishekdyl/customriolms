export interface LearnSummary {
  name: string; streak: number; week: boolean[]; days_trained: number;
  assigned_count: number; in_progress_count: number; completed_count: number;
  next_course_id: string | null; next_course_title: string | null; next_course_modules: number; has_unread: boolean;
}
export interface LearnCourseItem {
  id: string; title: string; category_name: string | null; duration_label: string;
  module_count: number; completed_modules: number; progress: number;
  status: "not_started" | "in_progress" | "completed"; cover_index: number;
}
export interface LearnQuestion { id: string; text: string; options: string[] }
export interface LearnModule {
  id: string; title: string; type: "watch" | "read" | "quiz" | "manual"; required: boolean; threshold: number;
  completed: boolean; score: number | null; skill_count: number; file_name: string | null; instructions: string | null;
  questions: LearnQuestion[];
}
export interface LearnCourseDetail {
  id: string; title: string; description: string | null; category_name: string | null; duration_label: string;
  progress: number; status: string; modules: LearnModule[];
}
export interface CompleteResult { progress: number; course_completed: boolean; certificate_code: string | null }
export interface QuizResult {
  score: number; passed: boolean; threshold: number; progress: number; course_completed: boolean; certificate_code: string | null;
  results: { question_id: string; picked: number | null; correct_index: number; correct: boolean }[];
}
export interface LearnBadge { id: string; name: string; criteria: string; value: string; color: string; earned: boolean }
export interface LearnCert { id: string; course_title: string; code: string; issued_at: string }
export interface LearnProgress {
  streak: number; completed_courses: number; rank: number; points: number;
  skills: { id: string; name: string; value: number }[]; badges: LearnBadge[]; certificates: LearnCert[];
}
export interface LeaderRow { id: string; name: string; team_name: string | null; points: number; is_me: boolean }
export interface LearnProfile {
  name: string; email: string; team_name: string | null; role: string;
  phone: string | null; job_title: string | null; location: string | null; bio: string | null;
}
export interface LearnNotification { id: string; kind: string; title: string; at: string | null }
export interface CertDetail {
  id: string; code: string; learner_name: string; course_title: string; certification_name: string;
  issuer_name: string; duration: string; issued_at: string;
  template: import("@/lib/types").CertTemplate;
}

export const coverPalette = ["#3D5AFE", "#FF8A00", "#8C54FF", "#00B8D9"];
export const moduleTypeLabel: Record<string, string> = {
  watch: "Watch video", quiz: "Pass quiz", read: "Read & acknowledge", manual: "Manual sign-off",
};
export const statusLabel: Record<string, string> = {
  not_started: "Not started", in_progress: "In progress", completed: "Completed",
};

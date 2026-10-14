// Mirrors the backend's Pydantic schemas exactly — see
// backend/app/schemas/*.py. Keep these in sync by hand for now;
// docs/architecture.md flags OpenAPI-generated types as the
// longer-term fix once the API surface stabilizes.

export type RoleName = "super_admin" | "org_admin" | "team_lead" | "learner";

export interface User {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  org_id: string;
  must_change_password?: boolean;
  team_name?: string | null;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  must_change_password: boolean;
  role?: RoleName;
}

export interface Team {
  id: string;
  name: string;
  member_count: number;
}

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  status: "invited" | "active" | "suspended" | "deactivated";
  team_id: string | null;
  team_name: string | null;
}

export interface BulkInviteResult {
  invited: number;
  skipped: string[];
  domain_rejected: string[];
  seat_limited: string[];
}

export interface Category {
  id: string;
  name: string;
  color: string;
  course_count: number;
}

// ---------- Courses ----------
export type ModuleType = "watch" | "read" | "quiz" | "manual" | "scorm";

export interface QuizQuestion {
  id: string;
  text: string;
  options: string[];
  correct_index: number;
}

export interface Module {
  id: string;
  title: string;
  type: ModuleType;
  position: number;
  required: boolean;
  threshold: number;
  file_url: string | null;
  file_name: string | null;
  file_size_label: string | null;
  scorm_launch_path: string | null;
  scorm_version: string | null;
  instructions: string | null;
  skill_ids: string[];
  badge_ids: string[];
  certificate_enabled: boolean;
  certificate_template_id: string | null;
  certificate_name: string | null;
  questions: QuizQuestion[];
}

export interface CourseListItem {
  id: string;
  title: string;
  category_id: string | null;
  category_name: string | null;
  duration_label: string;
  module_count: number;
  assigned_team_count: number;
  opens_at: string | null;
  closes_at: string | null;
}

/** One learner enrolled in a course — via their team or assigned directly —
 * with their own progress. From GET /courses/{id}/enrolled. */
export interface EnrolledLearner {
  user_id: string;
  name: string;
  email: string;
  team_name: string | null;
  via: "team" | "direct";
  progress_pct: number;
  completed: boolean;
}

export interface Course extends CourseListItem {
  description: string | null;
  assigned_team_ids: string[];
  assigned_user_ids: string[];
  certificate_enabled: boolean;
  certificate_template_id: string | null;
  certificate_name: string | null;
  certificate_org_name: string | null;
  badge_ids: string[];
  modules: Module[];
}

export type OrgPlan = "starter" | "growth" | "enterprise";
export type OrgStatus = "active" | "trial" | "suspended";

export interface Org {
  id: string;
  name: string;
  slug: string;
  plan: OrgPlan;
  status: OrgStatus;
  user_limit: number;
  allowed_domains: string[];
  created_at: string;
  industry: string | null;
  timezone: string;
  contact_email: string | null;
  logo_url: string | null;
  user_count: number;
  admin_email: string | null;
}

export interface PlatformSettings {
  allow_self_serve_signup: boolean;
}

export interface SuperAdmin {
  id: string;
  name: string;
  email: string;
}

// ---------- Skills / Badges / Certificate templates ----------
export interface Skill {
  id: string;
  name: string;
  module_count: number;
}

export type BadgeCriteria = "streak" | "score" | "completion" | "manual";

export interface Badge {
  id: string;
  name: string;
  criteria: BadgeCriteria;
  value: string;
  color: string;
}

export type CertSize = "landscape" | "portrait";

export interface CertTemplate {
  id: string;
  name: string;
  background_url: string | null;
  size: CertSize;
  accent_color: string;
  show_header: boolean;
  header_text: string;
  fields: Record<string, unknown>;
  field_positions: Record<string, unknown>;
  field_font_sizes: Record<string, unknown>;
}

/** A course assigned to the logged-in learner, with their own progress. */
export interface MyCourse extends CourseListItem {
  progress_pct: number;
}

export type ModuleKind = "watch" | "read" | "quiz" | "manual" | "scorm";

/** A module as a learner sees it — quiz questions have no answers. */
export interface LearnerModule {
  id: string;
  title: string;
  type: ModuleKind;
  position: number;
  required: boolean;
  threshold: number;
  file_url: string | null;
  file_name: string | null;
  file_size_label: string | null;
  scorm_launch_path: string | null;
  scorm_version: string | null;
  instructions: string | null;
  skill_count: number;
  questions: { id: string; text: string; options: string[] }[];
  completed: boolean;
}

/** One assigned course, learner-safe. From GET /api/v1/courses/mine/{id}. */
export interface LearnerCourse extends MyCourse {
  description: string | null;
  modules: LearnerModule[];
  completed_module_count: number;
}

/** Response from POST /courses/mine/{course_id}/modules/{module_id}/complete. */
export interface CompleteResult {
  progress: number;
  course_completed: boolean;
  certificate_code: string | null;
}

export interface QuizQuestionResult {
  question_id: string;
  picked: number | null;
  correct_index: number;
  correct: boolean;
}

/** Response from POST /courses/mine/{course_id}/modules/{module_id}/quiz. */
export interface QuizResult {
  score: number;
  passed: boolean;
  threshold: number;
  results: QuizQuestionResult[];
  progress: number;
  course_completed: boolean;
  certificate_code: string | null;
}

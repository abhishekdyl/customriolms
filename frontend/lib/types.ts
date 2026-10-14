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

export type QuestionType = "mcq" | "true_false" | "short_answer";

/** One MCQ/TRUE_FALSE option — at least one of text/image_url is present
 * (a "picture quiz" option is just an option with an image and no text,
 * not a different shape). id is stable across reorders. */
export interface QuestionOption {
  id: string;
  text: string | null;
  // Only populated in the authoring view (QuestionOut) — needed so the
  // editor can round-trip an unchanged image back as QuestionInput's
  // image_key without re-uploading it. Absent/null for a learner.
  image_key?: string | null;
  image_url: string | null;
}

/** Authoring shape — includes the answer key. Mirrors
 * backend/app/schemas/question.py's QuestionOut. */
export interface QuizQuestion {
  id: string;
  type: QuestionType;
  text: string | null;
  image_key: string | null;
  image_url: string | null;
  options: QuestionOption[];
  correct_option_id: string | null;
  accepted_answers: string[];
}

/** What the authoring UI sends to create/replace a question — mirrors
 * QuestionIn. image_key/option image_key are set by uploading first via
 * POST /question-banks/images, then embedding the returned key here. */
export interface QuestionInput {
  type: QuestionType;
  text: string | null;
  image_key: string | null;
  options: { id: string; text: string | null; image_key: string | null }[];
  correct_option_id: string | null;
  accepted_answers: string[];
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

/** Mirrors the backend's BadgeCriteria enum exactly (backend/app/models/badge.py).
 * `value`'s meaning depends on which of these is picked — see recognition.ts's
 * badgeCriteriaLabel for the human-readable hint per criteria. */
export type BadgeCriteria = "streak" | "category_complete" | "perfect_scores" | "team_rank_pct" | "course_complete";

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
  /** No answer key — mirrors QuestionLearnerOut. */
  questions: {
    id: string;
    type: QuestionType;
    text: string | null;
    image_url: string | null;
    options: QuestionOption[];
  }[];
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

/** One answer to one question, submitted by question_id (not position) —
 * mirrors QuizAnswerIn. option_id answers MCQ/TRUE_FALSE, text answers
 * SHORT_ANSWER. */
export interface QuizAnswer {
  question_id: string;
  option_id?: string | null;
  text?: string | null;
}

export interface QuizQuestionResult {
  question_id: string;
  picked_option_id: string | null;
  picked_text: string | null;
  correct_option_id: string | null;
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

/** One question's answer on one attempt, as it was snapshotted at submit
 * time — mirrors QuizAttemptAnswerOut. Survives the question being edited
 * or deleted later. */
export interface QuizAttemptAnswer {
  question_id: string;
  question_type: QuestionType;
  question_text: string | null;
  options: { id: string; text: string | null }[];
  picked_option_id: string | null;
  picked_option_text: string | null;
  picked_text: string | null;
  correct_option_id: string | null;
  correct_option_text: string | null;
  accepted_answers: string[];
  correct: boolean;
}

/** One learner's one submission of one quiz module — every attempt, pass
 * or fail. From GET /courses/{id}/quiz-attempts (Org Admin / Team Lead
 * only). Mirrors QuizAttemptOut. */
export interface QuizAttempt {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  module_id: string;
  module_title: string;
  score: number;
  passed: boolean;
  created_at: string;
  answers: QuizAttemptAnswer[];
}

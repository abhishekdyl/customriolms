// Mirrors the backend's Pydantic schemas exactly — see
// backend/app/schemas/*.py. Keep these in sync by hand for now;
// docs/architecture.md flags OpenAPI-generated types as the
// longer-term fix once the API surface stabilizes.

export type RoleName = "super_admin" | "org_admin" | "team_lead" | "learner";

export interface User {
  id: string;
  firstname: string;
  lastname: string;
  full_name: string;
  username: string;
  email: string;
  role: RoleName;
  org_id: string;
  must_change_password?: boolean;
  team_name?: string | null;
  profile_image_url?: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
  companyname?: string | null;
}

/** GET/PATCH /api/v1/learn/profile — the learner's own extended profile
 * fields (name/email/role/team come from User already; these are the
 * free-text ones, currently only surfaced so a module's "profile_field"
 * restriction (see ModuleRestriction) has something real to match). */
export interface LearnerProfile {
  name: string;
  email: string;
  team_name: string | null;
  role: string;
  phone: string | null;
  job_title: string | null;
  location: string | null;
  bio: string | null;
  country: string | null;
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
  firstname: string;
  lastname: string;
  full_name: string;
  username: string;
  email: string;
  role: RoleName;
  status: "invited" | "active" | "suspended" | "deactivated";
  team_id: string | null;
  team_name: string | null;
  city?: string | null;
  country?: string | null;
  timezone?: string | null;
  companyname?: string | null;
  phone?: string | null;
  job_title?: string | null;
  location?: string | null;
  bio?: string | null;
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
 * backend/app/schemas/question.py's QuestionOut. trigger_time_sec/
 * timer_seconds/points only matter for a WATCH module's in-video
 * questions — null/default on an ordinary QUIZ question. */
export interface QuizQuestion {
  id: string;
  type: QuestionType;
  text: string | null;
  image_key: string | null;
  image_url: string | null;
  options: QuestionOption[];
  correct_option_id: string | null;
  accepted_answers: string[];
  trigger_time_sec: number | null;
  timer_seconds: number | null;
  points: number;
}

/** What the authoring UI sends to create/replace a question — mirrors
 * QuestionIn. image_key/option image_key are set by uploading first via
 * POST /question-banks/images, then embedding the returned key here.
 * trigger_time_sec is required by the backend for every question on a
 * WATCH module (and rejected on a QUIZ module's) — see course_service's
 * update_module validation. Picture questions (image_key set, on the
 * question or any option) are rejected for WATCH modules too. */
export interface QuestionInput {
  type: QuestionType;
  text: string | null;
  image_key: string | null;
  options: { id: string; text: string | null; image_key: string | null }[];
  correct_option_id: string | null;
  accepted_answers: string[];
  trigger_time_sec?: number | null;
  timer_seconds?: number | null;
  points?: number;
}

/** One access condition on a module (Module.restrictions) — ALL of a
 * module's restrictions must pass before a learner can see/complete it.
 * Mirrors backend/app/schemas/course.py's ModuleRestrictionIn exactly. */
export type ModuleRestriction =
  | { type: "date_window"; opens_at: string | null; closes_at: string | null }
  | { type: "profile_field"; field: "country" | "location" | "job_title"; value: string }
  | { type: "module_score"; module_id: string; min_score: number };

export interface Module {
  id: string;
  title: string;
  type: ModuleType;
  position: number;
  required: boolean;
  threshold: number;
  // WATCH-only extra completion gate: min correct in-video answers,
  // alongside threshold (watched-%) above. Null = no such gate.
  video_question_min_correct: number | null;
  // Draft/published gate — a brand-new module starts false (hidden from
  // every learner) and flips true the first time it's explicitly saved,
  // or whenever this is set directly (manual publish/un-publish). See
  // the backend Module.published docstring.
  published: boolean;
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
  restrictions: ModuleRestriction[];
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

/** One column of the module-progress matrix — just enough to label it. */
export interface ModuleSummary {
  id: string;
  title: string;
  type: ModuleType;
  required: boolean;
}

export interface ModuleProgressCell {
  module_id: string;
  completed: boolean;
  score: number | null;
}

export interface LearnerModuleProgress {
  user_id: string;
  name: string;
  email: string;
  team_name: string | null;
  course_completed: boolean;
  /** Same order as CourseModuleProgress.modules. */
  cells: ModuleProgressCell[];
}

/** The Moodle-style "who completed which module" matrix. From
 * GET /courses/{id}/module-progress (Org Admin / Team Lead). */
export interface CourseModuleProgress {
  modules: ModuleSummary[];
  learners: LearnerModuleProgress[];
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
  /** When non-empty, the course completes the moment EVERY module in
   * this list is done, instead of the default "every required module
   * done" rule — can be one module or several. */
  completion_module_ids: string[];
  /** When true, modules unlock one at a time in position order — a
   * learner can't open/complete module N+1 until module N is done. */
  sequential_unlock: boolean;
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
  allow_custom_username: boolean;
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
  video_question_min_correct: number | null;
  file_url: string | null;
  file_name: string | null;
  file_size_label: string | null;
  scorm_launch_path: string | null;
  scorm_version: string | null;
  instructions: string | null;
  skill_count: number;
  /** No answer key — mirrors QuestionLearnerOut. trigger_time_sec/
   * timer_seconds are included (unlike the answer key) so the WATCH
   * player knows when to pause and whether to run a countdown. */
  questions: {
    id: string;
    type: QuestionType;
    text: string | null;
    image_url: string | null;
    options: QuestionOption[];
    trigger_time_sec: number | null;
    timer_seconds: number | null;
    points: number;
  }[];
  completed: boolean;
  /** Best score (QUIZ) or furthest watched-% (WATCH) recorded so far —
   * null until there's a qualifying attempt. */
  score: number | null;
  /** True when sequential_unlock blocks this module OR any of its own
   * restrictions isn't satisfied yet. file_url/questions are already
   * stripped by the backend when this is true. */
  locked: boolean;
  /** Human-readable reason for the lock above (null when not locked) —
   * comes straight from the backend, so the frontend never re-derives it. */
  lock_reason: string | null;
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
  /** Populated only when the WATCH module had in-video questions —
   * per-question correctness, same shape as QuizResult.results. */
  video_question_results: QuizQuestionResult[];
  /** Raw marks for those in-video questions ("earned 2/3 marks") — null
   * when the module had none. */
  video_earned_points: number | null;
  video_total_points: number | null;
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
  /** Raw marks alongside score's percent — "earned 3/5 marks". */
  earned_points: number;
  total_points: number;
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
  /** This question's own weight — null on an attempt recorded before
   * per-question points existed. */
  points: number | null;
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
  /** Raw marks alongside score's percent — null on an attempt recorded
   * before per-question points existed. */
  earned_points: number | null;
  total_points: number | null;
  created_at: string;
  answers: QuizAttemptAnswer[];
}

export type ProfileFieldType = "input" | "textarea" | "checkbox" | "radio" | "select";

/** Org-admin-defined custom profile field. Mirrors ProfileFieldOut. */
export interface ProfileField {
  id: string;
  shortname: string;
  name: string;
  field_type: ProfileFieldType;
  options: string[];
  required: boolean;
  sortorder: number;
}

/** A field definition plus one user's current value for it. Mirrors
 * ProfileFieldValueOut — used both for a user's own custom-field form
 * and an admin's "view this user" screen. */
export interface ProfileFieldValue extends ProfileField {
  value: string | null;
}

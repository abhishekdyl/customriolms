"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CompleteResult, LearnerCourse, QuizAnswer, QuizResult, ScormProgressState, WatchProgressState } from "@/lib/types";

/** Org Admin / course teacher walking through a course in its real
 * learner-facing flow — exact same shape and module-completion
 * semantics as the learner's own lib/hooks/use-my-courses.ts, just
 * hitting /preview instead of /mine (no real enrolment required; see
 * backend course_preview_service's module docstring for why a
 * previewer's own progress here never shows up in any real learner's
 * gradebook/leaderboard/participants list). Every hook below is a
 * deliberate 1:1 mirror of use-my-courses.ts's, by name, so the
 * learner-side course-view components (ModuleRow, WatchPlayer,
 * ScormModuleRow, QuizPanel) work completely unmodified against either
 * module — only the import line differs between the two pages. */

export function usePreviewCourse(id: string) {
  return useQuery({
    queryKey: ["courses", "preview", id],
    queryFn: () => api.get<LearnerCourse>(`/api/v1/courses/${id}/preview`),
    enabled: !!id,
    retry: false,
  });
}

export function useCompleteModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      moduleId, watched_pct, answers, scorm_score, scorm_passed, scorm_status,
    }: {
      moduleId: string; watched_pct?: number; answers?: QuizAnswer[];
      scorm_score?: number; scorm_passed?: boolean | null; scorm_status?: string;
    }) =>
      api.post<CompleteResult>(`/api/v1/courses/${courseId}/preview/modules/${moduleId}/complete`, {
        watched_pct, answers, scorm_score, scorm_passed, scorm_status,
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", "preview", courseId] }),
  });
}

export function useCheckpointWatchProgress(courseId: string) {
  return useMutation({
    mutationFn: ({ moduleId, watched_pct, answer }: { moduleId: string; watched_pct?: number; answer?: QuizAnswer }) =>
      api.patch<WatchProgressState>(`/api/v1/courses/${courseId}/preview/modules/${moduleId}/watch-progress`, { watched_pct, answer }),
  });
}

export function useRetakeWatchModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) =>
      api.post<WatchProgressState>(`/api/v1/courses/${courseId}/preview/modules/${moduleId}/watch-retake`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", "preview", courseId] }),
  });
}

export function useCheckpointScormProgress(courseId: string) {
  return useMutation({
    mutationFn: ({ moduleId, cmi }: { moduleId: string; cmi: Record<string, string> }) =>
      api.patch<ScormProgressState>(`/api/v1/courses/${courseId}/preview/modules/${moduleId}/scorm-progress`, { cmi }),
  });
}

export function useRetakeScormModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) =>
      api.post<ScormProgressState>(`/api/v1/courses/${courseId}/preview/modules/${moduleId}/scorm-retake`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", "preview", courseId] }),
  });
}

export function useSubmitQuiz(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, answers }: { moduleId: string; answers: QuizAnswer[] }) =>
      api.post<QuizResult>(`/api/v1/courses/${courseId}/preview/modules/${moduleId}/quiz`, { answers }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", "preview", courseId] }),
  });
}

/** Wipes the caller's own progress on this one course (see backend
 * course_preview_service.reset_preview_progress) so they can restart
 * the whole flow from module 1. */
export function useResetCoursePreview(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>(`/api/v1/courses/${courseId}/preview/reset`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", "preview", courseId] }),
  });
}

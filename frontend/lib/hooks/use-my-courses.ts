"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CompleteResult, LearnerCourse, MyCourse, QuizAnswer, QuizResult, WatchProgressState } from "@/lib/types";

/** Courses assigned to the logged-in user (via team or directly), with progress. */
export function useMyCourses() {
  return useQuery({
    queryKey: ["courses", "mine"],
    queryFn: () => api.get<MyCourse[]>("/api/v1/courses/mine"),
  });
}

/** One assigned course with its modules. 404s if it isn't assigned to this user. */
export function useMyCourse(id: string) {
  return useQuery({
    queryKey: ["courses", "mine", id],
    queryFn: () => api.get<LearnerCourse>(`/api/v1/courses/mine/${id}`),
    enabled: !!id,
    retry: false,
  });
}

/** Marks a non-quiz module (watch/read/manual/scorm) done for the caller.
 * watched_pct only matters for a WATCH module — the backend 400s if it's
 * below that module's threshold (see learn_service.complete_module).
 * answers carries any in-video question answers the learner submitted
 * during playback (a timed-out, unanswered question is simply absent
 * from this array — it's not counted as wrong, see QuizAnswerIn) — only
 * meaningful for a WATCH module with in-video questions, ignored otherwise. */
export function useCompleteModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, watched_pct, answers }: { moduleId: string; watched_pct?: number; answers?: QuizAnswer[] }) =>
      api.post<CompleteResult>(`/api/v1/courses/mine/${courseId}/modules/${moduleId}/complete`, { watched_pct, answers }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses", "mine", courseId] });
      qc.invalidateQueries({ queryKey: ["courses", "mine"] });
    },
  });
}

/** Checkpoints a WATCH module's in-progress state — called on an interval
 * for watched_pct, and immediately whenever an in-video question is
 * submitted — so a reload / new tab / fresh login resumes exactly where
 * the learner left off. Never gated and never invalidates the course
 * query: this fires constantly during playback and isn't an "attempt", so
 * refetching the whole course on every call would be wasteful and would
 * fight the player's own local state. */
export function useCheckpointWatchProgress(courseId: string) {
  return useMutation({
    mutationFn: ({ moduleId, watched_pct, answer }: { moduleId: string; watched_pct?: number; answer?: QuizAnswer }) =>
      api.patch<WatchProgressState>(`/api/v1/courses/mine/${courseId}/modules/${moduleId}/watch-progress`, { watched_pct, answer }),
  });
}

/** Explicit "retake" for a WATCH module's in-video questions — same
 * attempts gate as a quiz retake (the module's retake_enabled/retake_limit
 * plus any per-learner override). Resets the server's answered-question
 * set so the next playthrough asks every in-video question again; 403s
 * once attempts are exhausted. Invalidates the course query since this
 * does change what the learner sees (fresh resume state, attempts_used
 * unchanged until they actually submit again). */
export function useRetakeWatchModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) =>
      api.post<WatchProgressState>(`/api/v1/courses/mine/${courseId}/modules/${moduleId}/watch-retake`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", "mine", courseId] }),
  });
}

/** Scores a quiz module's answers server-side and records the attempt. */
export function useSubmitQuiz(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, answers }: { moduleId: string; answers: QuizAnswer[] }) =>
      api.post<QuizResult>(`/api/v1/courses/mine/${courseId}/modules/${moduleId}/quiz`, { answers }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses", "mine", courseId] });
      qc.invalidateQueries({ queryKey: ["courses", "mine"] });
    },
  });
}

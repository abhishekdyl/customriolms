"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CompleteResult, LearnerCourse, MyCourse, QuizAnswer, QuizResult } from "@/lib/types";

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

/** Marks a non-quiz module (watch/read/manual) done for the caller. */
export function useCompleteModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) =>
      api.post<CompleteResult>(`/api/v1/courses/mine/${courseId}/modules/${moduleId}/complete`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses", "mine", courseId] });
      qc.invalidateQueries({ queryKey: ["courses", "mine"] });
    },
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

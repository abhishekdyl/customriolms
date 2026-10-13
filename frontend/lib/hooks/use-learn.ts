"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  CertDetail, CompleteResult, LeaderRow, LearnCourseDetail, LearnCourseItem, LearnNotification, LearnProfile,
  LearnProgress, LearnSummary, QuizResult,
} from "@/lib/learn";

const base = "/api/v1/learn";

export function useLearnSummary() {
  return useQuery({ queryKey: ["learn", "summary"], queryFn: () => api.get<LearnSummary>(`${base}/summary`) });
}
export function useLearnCourses() {
  return useQuery({ queryKey: ["learn", "courses"], queryFn: () => api.get<LearnCourseItem[]>(`${base}/courses`) });
}
export function useLearnCourse(id: string) {
  return useQuery({ queryKey: ["learn", "course", id], queryFn: () => api.get<LearnCourseDetail>(`${base}/courses/${id}`), enabled: !!id });
}
export function useLearnProgress() {
  return useQuery({ queryKey: ["learn", "progress"], queryFn: () => api.get<LearnProgress>(`${base}/progress`) });
}
export function useLearnLeaderboard() {
  return useQuery({ queryKey: ["learn", "leaderboard"], queryFn: () => api.get<LeaderRow[]>(`${base}/leaderboard`) });
}
export function useLearnProfile() {
  return useQuery({ queryKey: ["learn", "profile"], queryFn: () => api.get<LearnProfile>(`${base}/profile`) });
}
export function useLearnNotifications() {
  return useQuery({ queryKey: ["learn", "notifications"], queryFn: () => api.get<LearnNotification[]>(`${base}/notifications`) });
}
export function useLearnCertificate(id: string) {
  return useQuery({ queryKey: ["learn", "certificate", id], queryFn: () => api.get<CertDetail>(`${base}/certificates/${id}`), enabled: !!id });
}

function useRefreshLearn() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["learn"] });
}

export function useCompleteModule() {
  const refresh = useRefreshLearn();
  return useMutation({
    mutationFn: (moduleId: string) => api.post<CompleteResult>(`${base}/modules/${moduleId}/complete`, {}),
    onSuccess: refresh,
  });
}
export function useSubmitQuiz() {
  const refresh = useRefreshLearn();
  return useMutation({
    mutationFn: ({ moduleId, answers }: { moduleId: string; answers: number[] }) =>
      api.post<QuizResult>(`${base}/modules/${moduleId}/quiz`, { answers }),
    onSuccess: refresh,
  });
}
export function useUpdateLearnProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Pick<LearnProfile, "name" | "phone" | "job_title" | "location" | "bio">>) =>
      api.patch<LearnProfile>(`${base}/profile`, body),
    onSuccess: (data) => {
      qc.setQueryData(["learn", "profile"], data);
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["learn", "summary"] });
      qc.invalidateQueries({ queryKey: ["learn", "leaderboard"] });
    },
  });
}

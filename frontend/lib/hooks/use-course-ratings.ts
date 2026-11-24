"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  CourseRatingAdmin, CourseRatingSummary, MyCourseRating, RatingEligibility,
} from "@/lib/types";

const base = (courseId: string) => `/api/v1/courses/${courseId}/ratings`;

export function useCourseRatingSummary(courseId: string) {
  return useQuery({ queryKey: ["course-rating-summary", courseId], queryFn: () => api.get<CourseRatingSummary>(`${base(courseId)}/summary`), enabled: !!courseId });
}
export function useMyCourseRating(courseId: string) {
  return useQuery({ queryKey: ["course-rating-mine", courseId], queryFn: () => api.get<MyCourseRating | null>(`${base(courseId)}/me`), enabled: !!courseId });
}
export function useRatingEligibility(courseId: string) {
  return useQuery({ queryKey: ["course-rating-eligibility", courseId], queryFn: () => api.get<RatingEligibility>(`${base(courseId)}/eligibility`), enabled: !!courseId });
}
export function useSubmitCourseRating(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { rating: number; review_text?: string | null }) => api.post<MyCourseRating>(base(courseId), body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["course-rating-mine", courseId] });
      qc.invalidateQueries({ queryKey: ["course-rating-summary", courseId] });
      // Rating badge on the course card lives in the course list payload.
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

// ---- Moderation (Org Admin / course creator only) ----
export function useCourseRatingsAdmin(courseId: string) {
  return useQuery({ queryKey: ["course-ratings-admin", courseId], queryFn: () => api.get<CourseRatingAdmin[]>(`${base(courseId)}/admin`), enabled: !!courseId });
}
export function useModerateCourseRating(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, review_text }: { id: string; review_text: string | null }) => api.patch<CourseRatingAdmin>(`${base(courseId)}/${id}`, { review_text }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["course-ratings-admin", courseId] });
    },
  });
}
export function useDeleteCourseRating(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${base(courseId)}/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["course-ratings-admin", courseId] });
      qc.invalidateQueries({ queryKey: ["course-rating-summary", courseId] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CourseAnnouncement } from "@/lib/types";

const base = (courseId: string) => `/api/v1/courses/${courseId}/announcements`;

export function useCourseAnnouncements(courseId: string) {
  return useQuery({
    queryKey: ["course-announcements", courseId],
    queryFn: () => api.get<CourseAnnouncement[]>(base(courseId)),
    enabled: !!courseId,
  });
}

export function useCreateCourseAnnouncement(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; body: string }) => api.post<CourseAnnouncement>(base(courseId), body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["course-announcements", courseId] }),
  });
}

export function useUpdateCourseAnnouncement(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; title?: string; body?: string; is_hidden?: boolean }) =>
      api.patch<CourseAnnouncement>(`${base(courseId)}/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["course-announcements", courseId] }),
  });
}

export function useDeleteCourseAnnouncement(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${base(courseId)}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["course-announcements", courseId] }),
  });
}

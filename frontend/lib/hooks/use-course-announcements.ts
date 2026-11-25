"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CourseAnnouncement, CourseAnnouncementComment } from "@/lib/types";

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
    mutationFn: ({ id, ...body }: { id: string; title?: string; body?: string; is_hidden?: boolean; comments_enabled?: boolean }) =>
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

// ---- Discussion thread (per announcement) ----
const commentsBase = (courseId: string, announcementId: string) => `${base(courseId)}/${announcementId}/comments`;

export function useAnnouncementComments(courseId: string, announcementId: string) {
  return useQuery({
    queryKey: ["announcement-comments", courseId, announcementId],
    queryFn: () => api.get<CourseAnnouncementComment[]>(commentsBase(courseId, announcementId)),
    enabled: !!courseId && !!announcementId,
  });
}

export function useCreateAnnouncementComment(courseId: string, announcementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: string) => api.post<CourseAnnouncementComment>(commentsBase(courseId, announcementId), { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcement-comments", courseId, announcementId] });
      qc.invalidateQueries({ queryKey: ["course-announcements", courseId] }); // comment_count
    },
  });
}

export function useDeleteAnnouncementComment(courseId: string, announcementId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (commentId: string) => api.delete(`${commentsBase(courseId, announcementId)}/${commentId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcement-comments", courseId, announcementId] });
      qc.invalidateQueries({ queryKey: ["course-announcements", courseId] });
    },
  });
}

"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { Course, CourseListItem, CourseModuleProgress, EnrolledLearner, Module, QuestionInput, QuizAttempt } from "@/lib/types";

export function useCourses() {
  return useQuery({ queryKey: ["courses"], queryFn: () => api.get<CourseListItem[]>("/api/v1/courses") });
}

export function useCourse(id: string) {
  return useQuery({
    queryKey: ["courses", id],
    queryFn: () => api.get<Course>(`/api/v1/courses/${id}`),
    enabled: !!id,
  });
}

export function useCreateCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; category_id?: string | null; opens_at?: string | null; closes_at?: string | null }) =>
      api.post<Course>("/api/v1/courses", body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

export function useUpdateCourse(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Course>) => api.patch<Course>(`/api/v1/courses/${courseId}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses", courseId] });
      qc.invalidateQueries({ queryKey: ["courses"] });
    },
  });
}

export function useDeleteCourse() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/courses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

export function useAssignCourse(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { team_ids: string[]; user_ids: string[] }) => api.post<Course>(`/api/v1/courses/${courseId}/assign`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

export function useBulkAssignCourses() {
  const qc = useQueryClient();
  return useMutation({
    // No bulk-assign endpoint on the backend yet — this just calls the
    // existing single-course /assign once per selected course. Fine for
    // the handful of courses a bulk-select would realistically cover.
    mutationFn: async (body: { course_ids: string[]; team_ids: string[]; user_ids: string[] }) => {
      await Promise.all(
        body.course_ids.map((id) => api.post(`/api/v1/courses/${id}/assign`, { team_ids: body.team_ids, user_ids: body.user_ids }))
      );
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses"] }),
  });
}

export function useAddModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { title: string; type?: string }) => api.post<Module>(`/api/v1/courses/${courseId}/modules`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", courseId] }),
  });
}

export function useUpdateModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    // `questions` here is QuestionInput[] (what the PATCH endpoint
    // actually accepts), not Module["questions"] (QuizQuestion[], the GET
    // shape with a server id + presigned image_url) — see quiz-utils.ts.
    mutationFn: ({ moduleId, ...body }: { moduleId: string } & Omit<Partial<Module>, "questions"> & { questions?: QuestionInput[] }) =>
      api.patch<Module>(`/api/v1/courses/${courseId}/modules/${moduleId}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", courseId] }),
  });
}

/** Real file upload for a WATCH (video) or READ (PDF/DOC/PPT) module — the
 * returned Module carries a fresh presigned file_url, file_name, and
 * file_size_label straight from object storage. */
export function useUploadModuleFile(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, file }: { moduleId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<Module>(`/api/v1/courses/${courseId}/modules/${moduleId}/upload`, formData);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", courseId] }),
  });
}

/** Uploads a SCORM 1.2/2004 .zip — the backend unpacks it and returns the
 * module with its launch path/version filled in. */
export function useUploadScormPackage(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ moduleId, file }: { moduleId: string; file: File }) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.upload<Module>(`/api/v1/courses/${courseId}/modules/${moduleId}/scorm-upload`, formData);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", courseId] }),
  });
}

export function useRemoveModuleFile(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) => api.delete(`/api/v1/courses/${courseId}/modules/${moduleId}/file`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", courseId] }),
  });
}

export function useDeleteModule(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleId: string) => api.delete(`/api/v1/courses/${courseId}/modules/${moduleId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", courseId] }),
  });
}

export function useReorderModules(courseId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (moduleIds: string[]) => api.post(`/api/v1/courses/${courseId}/modules/reorder`, { module_ids: moduleIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["courses", courseId] }),
  });
}

/** Who's actually enrolled in a course — team + individual assignment
 * resolved into real learners, each with their own progress. */
export function useEnrolledLearners(courseId: string) {
  return useQuery({
    queryKey: ["courses", courseId, "enrolled"],
    queryFn: () => api.get<EnrolledLearner[]>(`/api/v1/courses/${courseId}/enrolled`),
    enabled: !!courseId,
  });
}

/** Every quiz submission on this course — pass or fail — with exactly what
 * each learner answered. Org Admin sees everyone; Team Lead sees only their
 * own team. From GET /courses/{id}/quiz-attempts. */
export function useQuizAttempts(courseId: string) {
  return useQuery({
    queryKey: ["courses", courseId, "quiz-attempts"],
    queryFn: () => api.get<QuizAttempt[]>(`/api/v1/courses/${courseId}/quiz-attempts`),
    enabled: !!courseId,
  });
}

/** The module-by-module completion matrix — every enrolled learner as a
 * row, every module as a column. Org Admin sees everyone; Team Lead sees
 * only their own team. From GET /courses/{id}/module-progress. */
export function useModuleProgress(courseId: string) {
  return useQuery({
    queryKey: ["courses", courseId, "module-progress"],
    queryFn: () => api.get<CourseModuleProgress>(`/api/v1/courses/${courseId}/module-progress`),
    enabled: !!courseId,
  });
}

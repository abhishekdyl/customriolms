"use client";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { LearnerCourse, MyCourse } from "@/lib/types";

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

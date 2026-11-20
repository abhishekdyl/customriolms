"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CatalogCourse } from "@/lib/types";

/** Published courses this learner isn't enrolled in yet but could self
 * or paid-enrol into — see backend GET /courses/catalog. */
export function useEnrolmentCatalog() {
  return useQuery({ queryKey: ["courses", "catalog"], queryFn: () => api.get<CatalogCourse[]>("/api/v1/courses/catalog") });
}

export function useSelfEnrol() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (courseId: string) => api.post<{ enrolled: boolean }>(`/api/v1/courses/${courseId}/self-enrol`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses", "catalog"] });
      qc.invalidateQueries({ queryKey: ["courses", "mine"] });
    },
  });
}

export interface CourseEnrolCheckout {
  razorpay_order_id: string;
  razorpay_key_id: string;
  amount: number; // paise
  currency: string;
  course_id: string;
}

export function useCourseEnrolCheckout() {
  return useMutation({
    mutationFn: (courseId: string) => api.post<CourseEnrolCheckout>(`/api/v1/courses/${courseId}/enrol/checkout`, {}),
  });
}

export function useVerifyCourseEnrolPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ courseId, ...body }: { courseId: string; razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
      api.post<{ enrolled: boolean }>(`/api/v1/courses/${courseId}/enrol/verify`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["courses", "catalog"] });
      qc.invalidateQueries({ queryKey: ["courses", "mine"] });
    },
  });
}

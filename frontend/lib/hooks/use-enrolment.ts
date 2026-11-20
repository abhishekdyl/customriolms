"use client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CatalogCourse, CourseEnrolmentPayment } from "@/lib/types";

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
      qc.invalidateQueries({ queryKey: ["courses", "enrol-payments", "mine"] });
    },
  });
}

/** A learner's own "Payments" page — every paid-enrolment checkout
 * they've made, across any course, newest first. */
export function useMyCourseEnrolPayments() {
  return useQuery({
    queryKey: ["courses", "enrol-payments", "mine"],
    queryFn: () => api.get<CourseEnrolmentPayment[]>("/api/v1/courses/enrol-payments/mine"),
  });
}

/** Downloads the PDF invoice for one of the learner's own paid-enrolment
 * payments. */
export function downloadMyCourseEnrolPaymentInvoice(paymentId: string) {
  return api.download(`/api/v1/courses/enrol-payments/${paymentId}/invoice`, `invoice-${paymentId.slice(0, 8)}.pdf`);
}

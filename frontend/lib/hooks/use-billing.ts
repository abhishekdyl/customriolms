"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CheckoutOut, OrgPlan, Pricing, VerifyPaymentOut } from "@/lib/types";

/** Public, unauthenticated — the trial-ended upgrade screen needs this
 * before a suspended org's token is good for much else (see
 * billing.py's get_pricing). */
export function usePricing() {
  return useQuery({ queryKey: ["billing", "pricing"], queryFn: () => api.get<Pricing>("/api/v1/billing/pricing") });
}

export function useCheckout() {
  return useMutation({
    mutationFn: (plan: OrgPlan) => api.post<CheckoutOut>("/api/v1/billing/checkout", { plan }),
  });
}

export function useVerifyPayment() {
  return useMutation({
    mutationFn: (body: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
      api.post<VerifyPaymentOut>("/api/v1/billing/verify", body),
  });
}

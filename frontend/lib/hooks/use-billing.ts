"use client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type { CheckoutOut, OrgPayment, OrgPlan, Pricing, VerifyPaymentOut } from "@/lib/types";

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

/** The Org Admin's own Billing page — every subscription checkout
 * attempt this org has made (created/paid/failed), newest first. */
export function useMyOrgPayments() {
  return useQuery({ queryKey: ["billing", "payments"], queryFn: () => api.get<OrgPayment[]>("/api/v1/billing/payments") });
}

/** Downloads the PDF invoice for one of this org's own paid
 * subscription payments — see api-client.ts's download() for why this
 * can't just be an <a href>. */
export function downloadMyOrgPaymentInvoice(paymentId: string) {
  return api.download(`/api/v1/billing/payments/${paymentId}/invoice`, `invoice-${paymentId.slice(0, 8)}.pdf`);
}

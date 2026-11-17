import type { OrgPaymentStatus, OrgPlan, OrgStatus } from "@/lib/types";

// Shared display maps/helpers for anything that renders an Org or an
// OrgPayment — the Organizations page, the Subscriptions (formerly
// Pilots) page, and the org-detail drawer they both open. Centralized
// here so the two list pages and the drawer never drift out of sync on
// what a given plan/status/payment-status is called or colored.

export const planLabel: Record<OrgPlan, string> = {
  free: "Free",
  starter: "Starter",
  growth: "Growth",
  enterprise: "Enterprise",
};

export const planStyle: Record<OrgPlan, string> = {
  free: "bg-line-soft text-ink-soft",
  starter: "bg-primary-soft text-primary",
  growth: "bg-success-soft text-success",
  enterprise: "bg-amber-soft text-amber",
};

export const statusStyle: Record<OrgStatus, string> = {
  active: "bg-success-soft text-success",
  trial: "bg-amber-soft text-amber",
  suspended: "bg-danger-soft text-danger",
};

export const paymentStatusLabel: Record<OrgPaymentStatus, string> = {
  created: "Pending",
  paid: "Paid",
  failed: "Failed",
};

export const paymentStatusStyle: Record<OrgPaymentStatus, string> = {
  created: "bg-line-soft text-ink-soft",
  paid: "bg-success-soft text-success",
  failed: "bg-danger-soft text-danger",
};

export function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Whole days until `iso`, rounded up — negative/zero once it's passed. */
export function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86_400_000);
}

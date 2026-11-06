"use client";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Rocket, Check } from "lucide-react";
import { useLogout } from "@/lib/hooks/use-auth";
import { usePricing, useCheckout, useVerifyPayment } from "@/lib/hooks/use-billing";
import type { OrgPlan } from "@/lib/types";

const PLAN_LABEL: Record<OrgPlan, string> = { starter: "Starter", growth: "Growth", enterprise: "Enterprise" };

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

/** Loads Razorpay's checkout widget script once, on demand — not in
 * app/layout.tsx, since most visitors never reach this page. */
function useRazorpayScript(): boolean {
  const [ready, setReady] = useState(() => typeof window !== "undefined" && !!(window as any).Razorpay);
  useEffect(() => {
    if (ready) return;
    const existing = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
    if (existing) {
      existing.addEventListener("load", () => setReady(true));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => setReady(true);
    document.body.appendChild(script);
  }, [ready]);
  return ready;
}

/** Shown instead of the real dashboard once a self-registered org's
 * 15-day free trial has run out (see AuthGuard's trialEnded check) — the
 * only non-Super-Admin screen a trial_expired org can reach, since
 * deps.get_current_user_allow_trial_suspended still blocks every other
 * endpoint. Pay here (Razorpay Checkout) and the org is ACTIVE again
 * immediately; a Super Admin can also activate it manually from the
 * Pilots tab without any of this. */
export function TrialEndedPage() {
  const logout = useLogout();
  const qc = useQueryClient();
  const { data: pricing, isLoading } = usePricing();
  const checkout = useCheckout();
  const verify = useVerifyPayment();
  const razorpayReady = useRazorpayScript();
  const [payingPlan, setPayingPlan] = useState<OrgPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activated, setActivated] = useState(false);

  async function pay(plan: OrgPlan) {
    setError(null);
    setPayingPlan(plan);
    try {
      const order = await checkout.mutateAsync(plan);
      const rzp = new (window as any).Razorpay({
        key: order.razorpay_key_id,
        order_id: order.razorpay_order_id,
        amount: order.amount,
        currency: order.currency,
        name: "Riosmart LMS",
        description: `${PLAN_LABEL[plan]} plan — monthly`,
        theme: { color: "#4f46e5" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await verify.mutateAsync(response);
            setActivated(true);
            await qc.invalidateQueries({ queryKey: ["me"] });
          } catch {
            setError("Payment went through, but we couldn't confirm it automatically. Contact support with your payment ID.");
          } finally {
            setPayingPlan(null);
          }
        },
        modal: { ondismiss: () => setPayingPlan(null) },
      });
      rzp.on("payment.failed", () => {
        setError("Payment failed or was cancelled. You can try again.");
        setPayingPlan(null);
      });
      rzp.open();
    } catch {
      setError("Couldn't start checkout. Try again in a moment.");
      setPayingPlan(null);
    }
  }

  if (activated) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 bg-paper px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary-soft">
          <Check className="h-6 w-6 text-primary" />
        </div>
        <h1 className="font-head text-xl text-ink">You&apos;re all set</h1>
        <p className="max-w-[420px] text-sm text-ink-faint">Your organization is active again. Reloading…</p>
        {/* onSuccess already invalidated ["me"], so a full reload isn't
            strictly required — but it's the simplest way back into the
            normal shell from a screen that replaced it entirely. */}
        <script dangerouslySetInnerHTML={{ __html: "setTimeout(() => window.location.reload(), 1200);" }} />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-paper px-6 py-12 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-soft">
        <Rocket className="h-6 w-6 text-amber" />
      </div>
      <div>
        <h1 className="font-head text-xl text-ink">Your free trial has ended</h1>
        <p className="mx-auto mt-2 max-w-[460px] text-sm text-ink-faint">
          Your {pricing?.trial_days ?? 15}-day trial of Riosmart LMS is over. Pick a plan below to keep everything —
          your courses, users, and data are all exactly as you left them.
        </p>
      </div>

      {isLoading && <p className="text-sm text-ink-faint">Loading plans…</p>}

      {!isLoading && (!pricing || pricing.plans.length === 0) && (
        <p className="max-w-[420px] text-sm text-ink-faint">
          Online checkout isn&apos;t available right now. Contact your Riosmart representative to upgrade.
        </p>
      )}

      {!!pricing && pricing.plans.length > 0 && (
        <div className="grid w-full max-w-[720px] grid-cols-1 gap-4 sm:grid-cols-3">
          {pricing.plans.map((p) => (
            <div key={p.plan} className="flex flex-col gap-3 rounded-xl border border-line bg-paper-raised p-5 text-left">
              <div className="font-head text-sm text-ink">{PLAN_LABEL[p.plan]}</div>
              <div className="font-head text-2xl text-ink">
                {formatRupees(p.monthly_price)}
                <span className="text-xs font-normal text-ink-faint"> /month</span>
              </div>
              <div className="text-xs text-ink-faint">Up to {p.user_limit} users</div>
              <button
                onClick={() => pay(p.plan)}
                disabled={!razorpayReady || payingPlan !== null}
                className="mt-2 rounded-md bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
              >
                {payingPlan === p.plan ? "Opening checkout…" : "Upgrade now"}
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="max-w-[420px] text-xs text-danger">{error}</p>}

      <button onClick={logout} className="mt-2 text-xs font-medium text-primary">
        Log out
      </button>
    </div>
  );
}

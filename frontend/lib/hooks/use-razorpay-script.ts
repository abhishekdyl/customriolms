"use client";
import { useEffect, useState } from "react";

/** Loads Razorpay's checkout widget script once, on demand — not in
 * app/layout.tsx, since most visitors never reach a checkout screen.
 * Shared by the org-subscription checkout (trial-ended-page.tsx) and
 * course paid-enrolment checkout (catalog). */
export function useRazorpayScript(): boolean {
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

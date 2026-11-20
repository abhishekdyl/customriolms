"use client";
import { useState } from "react";
import { Lock, ShieldCheck } from "lucide-react";
import { useEnrolmentCatalog, useSelfEnrol, useCourseEnrolCheckout, useVerifyCourseEnrolPayment } from "@/lib/hooks/use-enrolment";
import { useRazorpayScript } from "@/lib/hooks/use-razorpay-script";
import type { CatalogCourse } from "@/lib/types";

function formatRupees(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function CatalogCard({ course }: { course: CatalogCourse }) {
  const selfEnrol = useSelfEnrol();
  const checkout = useCourseEnrolCheckout();
  const verify = useVerifyCourseEnrolPayment();
  const razorpayReady = useRazorpayScript();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function pay() {
    setError(null);
    setPaying(true);
    try {
      const order = await checkout.mutateAsync(course.id);
      const rzp = new (window as any).Razorpay({
        key: order.razorpay_key_id,
        order_id: order.razorpay_order_id,
        amount: order.amount,
        currency: order.currency,
        name: course.title,
        description: "Course enrolment",
        theme: { color: "#4f46e5" },
        handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
          try {
            await verify.mutateAsync({ courseId: course.id, ...response });
            setDone(true);
          } catch {
            setError("Payment went through, but we couldn't confirm it automatically. Contact support with your payment id.");
          } finally {
            setPaying(false);
          }
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      rzp.on("payment.failed", () => { setError("Payment failed or was cancelled. You can try again."); setPaying(false); });
      rzp.open();
    } catch {
      setError("Couldn't start checkout. Try again in a moment.");
      setPaying(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center gap-3 rounded-[14px] border border-success/40 bg-success-soft p-4 text-[13px] text-success">
        <ShieldCheck className="h-4 w-4 shrink-0" /> Enrolled in &quot;{course.title}&quot; — it&apos;ll show up in My Courses now.
      </div>
    );
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-[14px] border border-line bg-surface">
      <div className="relative h-[60px] bg-primary">
        {course.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element -- presigned URL
          <img src={course.cover_image_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
        )}
      </div>
      <div className="p-4">
        <div className="text-[11px] text-ink-faint">{course.category_name ?? "Uncategorized"}</div>
        <div className="mt-px font-head text-[14.5px] text-ink">{course.title}</div>

        {course.self_enrol_enabled && (
          <div className="mt-3">
            {course.self_enrol_blocked_reason ? (
              <div className="flex items-start gap-1.5 text-[11.5px] text-ink-faint">
                <Lock size={12} className="mt-0.5 shrink-0" /> <span>{course.self_enrol_blocked_reason}</span>
              </div>
            ) : (
              <button
                type="button" disabled={selfEnrol.isPending}
                onClick={() => selfEnrol.mutate(course.id)}
                className="w-full rounded-md bg-primary px-3 py-2 text-xs font-medium text-white disabled:opacity-60"
              >
                {selfEnrol.isPending ? "Enrolling…" : "Enrol — free"}
              </button>
            )}
          </div>
        )}

        {course.paid_enrol_enabled && course.paid_enrol_price != null && (
          <button
            type="button" disabled={!razorpayReady || paying}
            onClick={pay}
            className="mt-2 w-full rounded-md border border-primary px-3 py-2 text-xs font-medium text-primary disabled:opacity-60"
          >
            {paying ? "Opening checkout…" : `Pay ${formatRupees(course.paid_enrol_price)} to enrol`}
          </button>
        )}

        {error && <p className="mt-2 text-[11px] text-danger">{error}</p>}
        {selfEnrol.isError && <p className="mt-2 text-[11px] text-danger">Couldn&apos;t enrol — try again.</p>}
      </div>
    </div>
  );
}

/** Courses the learner isn't enrolled in yet but could self or paid-enrol
 * into — the "browse" counterpart to My Courses' "already assigned"
 * list. A course with neither method on never shows up here. */
export function CatalogList() {
  const { data: courses, isLoading, isError } = useEnrolmentCatalog();

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 gap-3 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {[0, 1, 2].map((i) => <div key={i} className="h-[176px] animate-pulse rounded-[14px] bg-line-soft" />)}
      </div>
    );
  }
  if (isError) return <p className="text-[13px] text-danger">Couldn&apos;t load the catalog. Please refresh.</p>;
  if (!courses || courses.length === 0) {
    return <div className="py-10 text-center text-[13px] text-ink-faint">No open or paid courses to enrol in right now.</div>;
  }
  return (
    <div className="grid grid-cols-1 gap-2 md:grid-cols-[repeat(auto-fill,minmax(260px,1fr))] md:gap-3">
      {courses.map((c) => <CatalogCard key={c.id} course={c} />)}
    </div>
  );
}

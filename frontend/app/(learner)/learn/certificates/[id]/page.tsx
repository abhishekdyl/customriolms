"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Download, Share2 } from "lucide-react";
import { LearnerPage } from "@/components/learner/shell";
import { CertPreview } from "@/components/shell/recognition/cert-preview";
import { useLearnCertificate } from "@/lib/hooks/use-learn";

export default function LearnerCertificatePage() {
  const { id } = useParams<{ id: string }>();
  const { data: c, isError } = useLearnCertificate(id);
  const date = c ? new Date(c.issued_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
  const sample = c && { learnerName: c.learner_name, courseTitle: c.course_title, date, duration: c.duration, issuerName: c.issuer_name, code: c.code };
  const linkedIn = c && `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(c.certification_name)}&organizationName=${encodeURIComponent(c.issuer_name)}&certId=${encodeURIComponent(c.code)}`;

  return (
    <LearnerPage>
      <Link href="/learn/progress" className="inline-flex items-center gap-1.5 py-1 mb-3 print:hidden">
        <ArrowLeft size={14} className="text-ink-soft" /><span className="text-[12.5px] text-ink-soft">Certificate</span>
      </Link>
      {isError && <div className="text-[13px] text-ink-faint">Certificate not found.</div>}
      {c && sample && (
        <div className="max-w-[760px] mx-auto">
          <CertPreview tpl={c.template} sample={sample} />
          <div className="flex gap-2 mt-4 print:hidden">
            <button type="button" onClick={() => window.print()} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[9px] bg-primary active:opacity-80">
              <Download size={14} className="text-white" /><span className="text-[12.5px] text-white font-medium">Download PDF</span>
            </button>
            <a href={linkedIn} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[9px] bg-[#0A66C2] active:opacity-80">
              <Share2 size={14} className="text-white" /><span className="text-[12.5px] text-white font-medium">Add to LinkedIn</span>
            </a>
          </div>
          <div className="text-center mt-3 text-[11.5px] text-ink-faint print:hidden">Verification code: {c.code}</div>
        </div>
      )}
    </LearnerPage>
  );
}

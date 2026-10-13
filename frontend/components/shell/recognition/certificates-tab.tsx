"use client";
import { useState } from "react";
import { Award, CheckCircle2, Pencil, Plus, Search, Share2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { useOrgNameForShare } from "./use-org-name";
import {
  useCertTemplates, useCreateCertTemplate, useDeleteCertTemplate, useIssuedCertificates,
  useRevokeCertificate, useUpdateCertTemplate,
} from "@/lib/hooks/use-cert-templates";
import { colorChoices, defaultFieldFontSizes, defaultFieldPositions, defaultFields, type CertSample, type IssuedCertificate } from "@/lib/recognition";
import type { CertTemplate } from "@/lib/types";
import { CertPreview } from "./cert-preview";
import { CertTemplateEditor } from "./cert-template-editor";
import { ConfirmRow, IconBtn } from "./ui";

const verifyUrl = (code: string) => `${typeof window !== "undefined" ? window.location.origin : ""}/verify/${code}`;
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

function TemplatesSection() {
  const { data: templates = [] } = useCertTemplates();
  const create = useCreateCertTemplate();
  const update = useUpdateCertTemplate();
  const remove = useDeleteCertTemplate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const add = () =>
    create.mutate(
      {
        name: "New template",
        accent_color: colorChoices[templates.length % colorChoices.length],
        size: "landscape",
        fields: defaultFields,
        field_positions: defaultFieldPositions,
        field_font_sizes: defaultFieldFontSizes,
      },
      { onSuccess: (t) => setEditingId(t.id) },
    );

  return (
    <div>
      <p className="text-[12.5px] text-ink-faint mb-4">
        Design how certificates look — your own background image, brand color, and which fields print on it. Assign a template to a course under Courses → Manage → Certificate on completion.
      </p>
      <div className="flex flex-col gap-3">
        {templates.map((t) =>
          editingId === t.id ? (
            <CertTemplateEditor
              key={t.id} tpl={t} saving={update.isPending}
              onSave={(d) => {
                const { id, ...body } = d;
                update.mutate({ id, ...body }, { onSuccess: () => setEditingId(null) });
              }}
              onCancel={() => setEditingId(null)}
            />
          ) : (
            <div key={t.id} className="flex items-center gap-3 p-4 bg-surface border border-line rounded-[10px]">
              <div
                className="w-11 h-[30px] rounded-[5px] shrink-0"
                style={{
                  border: `1.5px solid ${t.accent_color}`,
                  background: t.background_url ? `url(${t.background_url}) center/cover` : t.accent_color + "22",
                }}
              />
              <span className="text-[13.5px] text-ink font-medium flex-1">{t.name}</span>
              {confirmId === t.id ? (
                <ConfirmRow
                  label="Delete template?" busy={remove.isPending}
                  onConfirm={() => remove.mutate(t.id, { onSuccess: () => setConfirmId(null) })}
                  onCancel={() => setConfirmId(null)}
                />
              ) : (
                <>
                  <IconBtn icon={Pencil} label="Edit" onClick={() => setEditingId(t.id)} />
                  {templates.length > 1 && <IconBtn icon={Trash2} danger label="Delete" onClick={() => setConfirmId(t.id)} />}
                </>
              )}
            </div>
          ),
        )}
        <button
          type="button" onClick={add} disabled={create.isPending}
          className="w-full flex items-center justify-center gap-1.5 py-2.5 border-[1.5px] border-dashed border-line rounded-[10px] active:opacity-70"
        >
          <Plus size={13} className="text-primary" />
          <span className="text-[12.5px] text-primary font-medium">Add template</span>
        </button>
      </div>
    </div>
  );
}

function ShareModal({
  cert, template, orgName, onClose,
}: { cert: IssuedCertificate; template: CertTemplate | undefined; orgName: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const url = verifyUrl(cert.code);
  const sample: CertSample = {
    learnerName: cert.learner_name ?? "—", courseTitle: cert.course_title ?? "—", date: fmtDate(cert.issued_at),
    duration: "—", issuerName: orgName, code: cert.code,
  };
  const linkedIn = `https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME&name=${encodeURIComponent(cert.course_title ?? "")}&organizationName=${encodeURIComponent(orgName)}&certId=${encodeURIComponent(cert.code)}`;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-[720px] max-h-[90vh] overflow-auto">
        <div className="px-6 py-4 border-b border-line-soft"><DialogTitle>Certificate</DialogTitle></div>
        <div className="flex flex-col items-center px-6 py-8">
          <div className="flex items-center gap-2 px-4 py-2 mb-6 bg-success-soft rounded-full">
            <CheckCircle2 size={16} className="text-success" />
            <span className="text-[13px] text-ink font-medium">This certificate is verified and authentic</span>
          </div>
          <div className="w-full max-w-[640px]">
            {template ? <CertPreview tpl={template} sample={sample} /> : <div className="text-[12.5px] text-ink-faint text-center">No template available.</div>}
          </div>
          <div className="w-full max-w-[640px] bg-surface border border-line rounded-xl p-6 mt-5">
            <div className="grid grid-cols-2 gap-4 mb-5">
              {[["Awarded to", sample.learnerName], ["Issued by", orgName], ["Course", sample.courseTitle], ["Completed", sample.date]].map(([l, v]) => (
                <div key={l}><div className="text-[11px] text-ink-faint">{l}</div><div className="text-[14px] text-ink font-medium">{v}</div></div>
              ))}
            </div>
            <div className="flex items-center gap-2 px-3 py-2.5 mb-5 bg-paper rounded-lg">
              <span className="text-[11.5px] text-ink-faint flex-1">Verification code</span>
              <span className="text-[12px] text-ink font-semibold">{cert.code}</span>
            </div>
            <div className="flex gap-2">
              <button
                type="button" onClick={() => { navigator.clipboard?.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
                className="flex-1 flex items-center justify-center gap-2 py-3 border border-line rounded-[9px]"
              >
                <Share2 size={14} className={copied ? "text-success" : "text-ink-soft"} />
                <span className={`text-[12.5px] font-medium ${copied ? "text-success" : "text-ink-soft"}`}>{copied ? "Link copied" : "Copy link"}</span>
              </button>
              <a href={linkedIn} target="_blank" rel="noopener noreferrer" className="flex-1 flex items-center justify-center gap-2 py-3 rounded-[9px] bg-[#0A66C2]">
                <Share2 size={14} className="text-white" />
                <span className="text-[12.5px] text-white font-medium">Add to LinkedIn</span>
              </a>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CertificatesTab() {
  const [view, setView] = useState<"issued" | "design">("issued");
  const [search, setSearch] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<IssuedCertificate | null>(null);
  const { data: certs = [], isLoading } = useIssuedCertificates();
  const { data: templates = [] } = useCertTemplates();
  const revoke = useRevokeCertificate();
  const orgName = useOrgNameForShare();

  const shown = certs.filter((c) => `${c.learner_name ?? ""}${c.course_title ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const templateFor = (c: IssuedCertificate) => templates.find((t) => t.id === c.template_id) ?? templates[0];

  return (
    <div style={{ maxWidth: view === "design" ? 980 : 640 }}>
      <div className="flex p-1 mb-5 bg-line-soft rounded-lg w-[320px] max-w-full">
        {([["issued", "Issued"], ["design", "Design template"]] as const).map(([id, label]) => (
          <button key={id} type="button" onClick={() => setView(id)} className={`flex-1 py-2 rounded-md ${view === id ? "bg-surface" : ""}`}>
            <span className={`text-[12.5px] ${view === id ? "text-ink font-semibold" : "text-ink-faint"}`}>{label}</span>
          </button>
        ))}
      </div>

      {view === "design" ? <TemplatesSection /> : (
        <>
          <p className="text-[12.5px] text-ink-faint mb-4">
            Issued automatically when a learner completes a course&apos;s required modules. Revoking removes it from the learner&apos;s Progress tab immediately.
          </p>
          <div className="flex items-center gap-2 px-3 py-2.5 mb-4 border border-line rounded-lg bg-surface">
            <Search size={14} className="text-ink-faint" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by learner or course…" className="flex-1 text-[13px] outline-none bg-transparent" />
          </div>
          <div className="bg-surface border border-line rounded-[10px]">
            {shown.map((c, i) => (
              <div key={c.id} className={`flex items-center gap-3 p-4 ${i < shown.length - 1 ? "border-b border-line-soft" : ""}`}>
                <div className="w-[34px] h-[34px] rounded-[9px] bg-amber-soft shrink-0 flex items-center justify-center"><Award size={16} className="text-amber" /></div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-ink font-medium">{c.learner_name}</div>
                  <div className="text-[11.5px] text-ink-faint truncate">{c.course_title} · {fmtDate(c.issued_at)} · {c.code}</div>
                </div>
                {confirmId === c.id ? (
                  <ConfirmRow label="Revoke?" busy={revoke.isPending} onConfirm={() => revoke.mutate(c.id, { onSuccess: () => setConfirmId(null) })} onCancel={() => setConfirmId(null)} />
                ) : (
                  <>
                    <button type="button" onClick={() => setPreview(c)} className="text-[11.5px] text-ink-soft font-medium">View share page</button>
                    <button
                      type="button"
                      onClick={() => { navigator.clipboard?.writeText(verifyUrl(c.code)); setCopiedId(c.id); setTimeout(() => setCopiedId(null), 2000); }}
                      className={`text-[11.5px] font-medium ${copiedId === c.id ? "text-success" : "text-primary"}`}
                    >
                      {copiedId === c.id ? "Copied" : "Copy link"}
                    </button>
                    <button type="button" onClick={() => setConfirmId(c.id)} className="text-[11.5px] text-danger font-medium">Revoke</button>
                  </>
                )}
              </div>
            ))}
            {!isLoading && shown.length === 0 && (
              <div className="p-6 text-center text-[13px] text-ink-faint">
                {search ? `No certificates match "${search}"` : "No certificates issued yet."}
              </div>
            )}
          </div>
        </>
      )}
      {preview && <ShareModal cert={preview} template={templateFor(preview)} orgName={orgName} onClose={() => setPreview(null)} />}
    </div>
  );
}

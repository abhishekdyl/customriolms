"use client";
import { useRef, useState } from "react";
import { Check, CheckCircle2, Upload, X } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  certSampleData, certSizePresets, colorChoices, defaultFieldFontSizes, defaultFieldPositions, defaultFields,
  fieldChoices, type CertSizeId, type Pos,
} from "@/lib/recognition";
import type { CertTemplate } from "@/lib/types";
import { CertPreview } from "./cert-preview";

export function CertTemplateEditor({
  tpl, saving, onSave, onCancel,
}: { tpl: CertTemplate; saving: boolean; onSave: (t: CertTemplate) => void; onCancel: () => void }) {
  const [d, setD] = useState<CertTemplate>(tpl);
  const fileRef = useRef<HTMLInputElement>(null);
  const fields = (d.fields || {}) as Record<string, boolean>;
  const sizes = (d.field_font_sizes || {}) as Record<string, number>;
  const sizeId = d.size as CertSizeId;
  const preset = certSizePresets.find((s) => s.id === sizeId) || certSizePresets[0];

  const upload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => setD((p) => ({ ...p, background_url: String(e.target?.result ?? "") }));
    reader.readAsDataURL(file);
  };
  const fieldSize = (k: string) => sizes[k] ?? defaultFieldFontSizes[k];

  return (
    <div className="bg-surface border-[1.5px] border-primary rounded-[10px] p-5">
      <input
        value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })}
        className="font-head text-[15px] border border-line rounded-md px-[9px] py-[7px] w-full mb-2.5 outline-none"
      />

      <div className="text-[11.5px] text-ink-soft mb-1">Certificate size</div>
      <select
        value={sizeId} onChange={(e) => setD({ ...d, size: e.target.value as CertTemplate["size"] })}
        className="text-[13px] border border-line rounded-md px-[9px] py-[7px] w-full mb-1 bg-surface"
      >
        {certSizePresets.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
      </select>
      <div className="text-[10.5px] text-ink-faint mb-3.5">
        For a sharp result, upload a background around {preset.uploadHint}. The full image always fits inside this shape — nothing gets cropped — but a different-ratio image will show plain padding on two sides instead of filling edge to edge.
      </div>

      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11.5px] text-ink-soft">Header text</span>
        <Switch checked={d.show_header} onCheckedChange={(v) => setD({ ...d, show_header: v })} />
      </div>
      {d.show_header ? (
        <input
          value={d.header_text} onChange={(e) => setD({ ...d, header_text: e.target.value })} placeholder="CERTIFICATE OF COMPLETION"
          className="text-[12.5px] border border-line rounded-md px-[9px] py-[7px] w-full mb-3.5 outline-none"
        />
      ) : <div className="mb-3.5" />}

      <div className="grid gap-6 md:grid-cols-[260px_1fr]">
        <div>
          <div className="text-[11.5px] text-ink-soft mb-1.5">Background image</div>
          {d.background_url ? (
            <div className="flex items-center gap-2 px-3 py-2.5 mb-2 bg-success-soft rounded-lg">
              <CheckCircle2 size={14} className="text-success" />
              <span className="text-[12px] text-ink flex-1">Image uploaded</span>
              <button type="button" onClick={() => fileRef.current?.click()} className="text-[11px] text-primary font-medium">Replace</button>
              <button type="button" aria-label="Remove image" onClick={() => setD({ ...d, background_url: null })}><X size={13} className="text-ink-faint" /></button>
            </div>
          ) : (
            <button
              type="button" onClick={() => fileRef.current?.click()}
              className="w-full flex flex-col items-center justify-center gap-2 py-6 mb-2 border-[1.5px] border-dashed border-line rounded-lg active:opacity-70"
            >
              <Upload size={20} className="text-ink-faint" />
              <span className="text-[12px] text-ink-soft">Upload background (PNG/JPG)</span>
            </button>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />

          <div className="text-[11.5px] text-ink-soft mt-3.5 mb-1.5">Accent color</div>
          <div className="flex items-center gap-2 mb-4">
            {colorChoices.map((c) => (
              <button
                key={c} type="button" aria-label={c} onClick={() => setD({ ...d, accent_color: c })}
                className="w-5 h-5 rounded-full"
                style={{ background: c, border: d.accent_color === c ? "2px solid var(--color-ink)" : "2px solid transparent" }}
              />
            ))}
          </div>

          <div className="text-[11.5px] text-ink-soft mb-1.5">Fields to show, and their size</div>
          <div className="flex flex-col gap-2">
            {fieldChoices.map(([key, label]) => (
              <div key={key} className="flex items-center gap-2">
                <button type="button" onClick={() => setD({ ...d, fields: { ...fields, [key]: !fields[key] } })} className="flex items-center gap-2 flex-1 min-w-0">
                  <div
                    className="w-[15px] h-[15px] rounded-[4px] shrink-0 flex items-center justify-center"
                    style={{ border: `1.5px solid ${fields[key] ? "var(--color-primary)" : "var(--color-line)"}`, background: fields[key] ? "var(--color-primary)" : "transparent" }}
                  >
                    {fields[key] && <Check size={9} className="text-white" />}
                  </div>
                  <span className="text-[12.5px] text-ink text-left">{label}</span>
                </button>
                {key !== "qrCode" && (
                  <input
                    type="number" min={6} max={40} value={fieldSize(key)} disabled={!fields[key]}
                    onChange={(e) => setD({ ...d, field_font_sizes: { ...sizes, [key]: +e.target.value } })}
                    className="w-[42px] text-[11.5px] border border-line rounded-[5px] px-[5px] py-[3px] shrink-0"
                    style={{ opacity: fields[key] ? 1 : 0.4 }}
                  />
                )}
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11.5px] text-ink-soft">Live preview — drag any field to reposition</span>
            <button type="button" onClick={() => setD({ ...d, field_positions: defaultFieldPositions })} className="text-[11px] text-primary font-medium">Reset layout</button>
          </div>
          <CertPreview tpl={d} sample={certSampleData} editable onPositionChange={(p: Record<string, Pos>) => setD({ ...d, field_positions: p })} />
        </div>
      </div>

      <div className="flex gap-2 mt-5">
        <button type="button" disabled={saving || !d.name.trim()} onClick={() => onSave(d)} className="px-4 py-2 bg-primary rounded-md text-[12.5px] text-white font-medium disabled:opacity-60">Save template</button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-[12.5px] text-ink-soft">Cancel</button>
      </div>
    </div>
  );
}

export { defaultFields };

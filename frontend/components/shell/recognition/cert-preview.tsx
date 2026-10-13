"use client";
import { useRef, useState } from "react";
import { Award } from "lucide-react";
import { QRCodeSVG } from "@/components/shell/qr-code";
import {
  certSizePresets, defaultFieldFontSizes, defaultFieldPositions, type CertSample, type Pos,
} from "@/lib/recognition";
import type { CertTemplate } from "@/lib/types";

const fieldText: Record<string, (s: CertSample) => string> = {
  learnerName: (s) => s.learnerName,
  courseTitle: (s) => s.courseTitle,
  date: (s) => s.date,
  duration: (s) => s.duration,
  issuerName: (s) => s.issuerName,
  verificationCode: (s) => `Code: ${s.code}`,
};

export function CertPreview({
  tpl, sample, editable, onPositionChange,
}: {
  tpl: CertTemplate;
  sample: CertSample;
  editable?: boolean;
  onPositionChange?: (p: Record<string, Pos>) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const positions = (Object.keys(tpl.field_positions || {}).length ? tpl.field_positions : defaultFieldPositions) as Record<string, Pos>;
  const sizes = (tpl.field_font_sizes || {}) as Record<string, number>;
  const fields = (tpl.fields || {}) as Record<string, boolean>;
  const ratio = (certSizePresets.find((s) => s.id === tpl.size) || certSizePresets[0]).ratio;
  const accent = tpl.accent_color;

  const down = (key: string) => (e: React.PointerEvent) => {
    if (!editable) return;
    e.preventDefault();
    setDragging(key);
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent) => {
    if (!dragging || !ref.current || !onPositionChange) return;
    const r = ref.current.getBoundingClientRect();
    const x = Math.min(100, Math.max(0, ((e.clientX - r.left) / r.width) * 100));
    const y = Math.min(100, Math.max(0, ((e.clientY - r.top) / r.height) * 100));
    onPositionChange({ ...positions, [dragging]: { x, y } });
  };
  const up = () => setDragging(null);

  const showHeader = tpl.show_header && (tpl.header_text ?? "").trim() !== "";

  return (
    <div
      ref={ref} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
      className="relative w-full overflow-hidden bg-surface rounded-[14px]"
      style={{
        border: `2px solid ${accent}`, aspectRatio: `${ratio}`, userSelect: dragging ? "none" : "auto",
        backgroundImage: tpl.background_url ? `url(${tpl.background_url})` : "none",
        backgroundSize: "contain", backgroundRepeat: "no-repeat", backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-2 rounded-lg pointer-events-none" style={{ border: `1px solid ${accent}55` }} />
      {showHeader && (
        <div className="absolute top-3.5 left-1/2 -translate-x-1/2 text-center">
          <Award size={22} color={accent} className="mx-auto" />
          <div className="text-[8.5px] text-ink-faint tracking-[1px] mt-0.5">{tpl.header_text}</div>
        </div>
      )}
      {Object.entries(fields).filter(([, on]) => on).map(([key]) => {
        const pos = positions[key] || defaultFieldPositions[key];
        if (!pos) return null;
        const wrap: React.CSSProperties = {
          position: "absolute", left: `${pos.x}%`, top: `${pos.y}%`, transform: "translate(-50%, -50%)",
          cursor: editable ? (dragging === key ? "grabbing" : "grab") : "default",
          border: editable ? `1px dashed ${dragging === key ? accent : "transparent"}` : "none",
          borderRadius: 4,
        };
        if (key === "qrCode") {
          return (
            <div key={key} onPointerDown={down(key)} style={{ ...wrap, padding: 2, lineHeight: 0 }}>
              <QRCodeSVG value={`https://app.riosmartlms.com/verify/${sample.code}`} size={54} />
            </div>
          );
        }
        const fn = fieldText[key];
        if (!fn) return null;
        const size = sizes[key] ?? defaultFieldFontSizes[key];
        const head = key === "learnerName" || key === "courseTitle";
        return (
          <div
            key={key} onPointerDown={down(key)}
            className={head ? "font-head" : ""}
            style={{
              ...wrap, padding: "2px 6px", whiteSpace: "nowrap", fontSize: size,
              color: key === "courseTitle" ? accent : key === "verificationCode" ? "var(--color-ink-faint)" : "var(--color-ink)",
            }}
          >
            {fn(sample)}
          </div>
        );
      })}
    </div>
  );
}

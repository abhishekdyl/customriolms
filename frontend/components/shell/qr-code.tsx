"use client";
import { useMemo } from "react";
import { generateQR } from "@/lib/qr";

export function QRCodeSVG({ value, size = 140 }: { value: string; size?: number }) {
  const { matrix, moduleCount } = useMemo(() => generateQR(value, "M"), [value]);
  const border = 2;
  const total = moduleCount + border * 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${total} ${total}`}
      className="rounded-lg border border-line-soft bg-white"
    >
      <rect width={total} height={total} fill="#fff" />
      {matrix.map((row: boolean[], r: number) =>
        row.map(
          (dark, c) =>
            dark && <rect key={`${r}-${c}`} x={c + border} y={r + border} width={1} height={1} fill="#14142B" />
        )
      )}
    </svg>
  );
}

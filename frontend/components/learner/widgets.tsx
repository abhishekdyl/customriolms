"use client";

export function ProgressRing({ pct, size = 40, color = "var(--color-primary)" }: { pct: number; size?: number; color?: string }) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-line-soft)" strokeWidth="4" fill="none" />
        <circle
          cx={size / 2} cy={size / 2} r={r} stroke={color} strokeWidth="4" fill="none"
          strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ} strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold text-ink">{pct}%</span>
    </div>
  );
}

export function SkillRadar({ axes, size = 260 }: { axes: { label: string; value: number }[]; size?: number }) {
  const cx = size / 2, cy = size / 2, maxR = size / 2 - 52, n = axes.length;
  const pt = (i: number, r: number): [number, number] => {
    const a = (Math.PI * 2 * i) / n - Math.PI / 2;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const values = axes.map((a, i) => pt(i, (a.value / 100) * maxR));
  const anchor = (x: number) => (x < cx - 4 ? "end" : x > cx + 4 ? "start" : "middle");
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="max-w-full">
      {[0.25, 0.5, 0.75, 1].map((lvl) => (
        <polygon key={lvl} points={axes.map((_, i) => pt(i, lvl * maxR).join(",")).join(" ")} fill="none" stroke="var(--color-line-soft)" strokeWidth="1" />
      ))}
      {axes.map((_, i) => {
        const [x, y] = pt(i, maxR);
        return <line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="var(--color-line-soft)" strokeWidth="1" />;
      })}
      <polygon points={values.map((p) => p.join(",")).join(" ")} fill="var(--color-primary)" fillOpacity="0.16" stroke="var(--color-primary)" strokeWidth="2" />
      {values.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="3" fill="var(--color-primary)" />)}
      {axes.map((a, i) => {
        const [x, y] = pt(i, maxR + 14);
        return (
          <text key={a.label + i} x={x} y={y} textAnchor={anchor(x)} dy=".3em" fontSize="10.5" fill="var(--color-ink-soft)">
            {a.label.length > 16 ? a.label.slice(0, 15) + "…" : a.label}
          </text>
        );
      })}
    </svg>
  );
}

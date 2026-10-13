/** Circular progress indicator — same as ProgressRing in the prototype. */
export function ProgressRing({
  pct,
  size = 40,
  color = "var(--color-primary)",
}: {
  pct: number;
  size?: number;
  color?: string;
}) {
  const r = (size - 6) / 2;
  const circ = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="shrink-0" role="img" aria-label={`${pct}% complete`}>
      <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--color-line-soft)" strokeWidth="4" fill="none" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={color}
        strokeWidth="4"
        fill="none"
        strokeDasharray={circ}
        strokeDashoffset={circ - (pct / 100) * circ}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text
        x="50%"
        y="52%"
        textAnchor="middle"
        dy=".3em"
        className="font-body"
        style={{ fontSize: size > 44 ? 12 : 10.5, fontWeight: 600, fill: "var(--color-ink)" }}
      >
        {pct}%
      </text>
    </svg>
  );
}

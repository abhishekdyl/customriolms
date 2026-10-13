// Static sample numbers — no progress tracking exists in the backend yet.
// Shared by Dashboard (heatmap) and Recognition → Gap analysis so both agree.
const HEAT_BASE = [
  [88, 52, 34, 20],
  [90, 91, 70, 40],
  [60, 40, 55, 78],
  [95, 62, 88, 66],
];

export function heatColor(v: number) {
  const t = v / 100;
  const r = Math.round(232 - t * (232 - 61));
  const g = Math.round(235 - t * (235 - 90));
  const b = Math.round(255 - t * (255 - 254));
  return `rgb(${r},${g},${b})`;
}

export function heatValue(teamIndex: number, skillIndex: number) {
  return Math.max(10, Math.min(98, HEAT_BASE[teamIndex % 4][skillIndex % 4] + Math.floor(teamIndex / 4) * 3 - Math.floor(skillIndex / 4) * 5));
}

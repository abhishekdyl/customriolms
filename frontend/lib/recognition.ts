import type { BadgeCriteria } from "@/lib/types";

export interface IssuedCertificate {
  id: string;
  user_id: string;
  learner_name: string | null;
  course_id: string;
  course_title: string | null;
  template_id: string | null;
  code: string;
  issued_at: string;
}

/** Mirrors backend/app/models/badge.py's BadgeCriteria exactly. Each label
 * doubles as a hint for what "value" means for that criteria — a day
 * count, a Category name, a Course id, etc. */
export const badgeCriteriaLabel: Record<BadgeCriteria, string> = {
  streak: "Day login streak of",
  category_complete: "Completes every course in category",
  perfect_scores: "Perfect quiz scores, count of",
  team_rank_pct: "Ranks in top % of team",
  course_complete: "Completes course",
};

/** Placeholder/help text shown next to the value input for each criteria,
 * since "value" is a free-text string whose meaning depends on criteria
 * (see badge.py's BadgeCriteria comments). */
export const badgeCriteriaValueHint: Record<BadgeCriteria, string> = {
  streak: "e.g. 7 (days)",
  category_complete: "Category name",
  perfect_scores: "e.g. 3 (count)",
  team_rank_pct: "e.g. 10 (top %)",
  course_complete: "Course id",
};

export const colorChoices = ["#3D5AFE", "#FF8A00", "#8C54FF", "#00B8D9", "#FF3B5C", "#00C48C"];

export type CertSizeId = "landscape" | "portrait" | "square";
export const certSizePresets: { id: CertSizeId; label: string; ratio: number; uploadHint: string }[] = [
  { id: "landscape", label: "Landscape (11 × 8.5 in)", ratio: 11 / 8.5, uploadHint: "1600 × 1236 px" },
  { id: "portrait", label: "Portrait (8.5 × 11 in)", ratio: 8.5 / 11, uploadHint: "1236 × 1600 px" },
  { id: "square", label: "Square (1:1)", ratio: 1, uploadHint: "1400 × 1400 px" },
];

export type Pos = { x: number; y: number };
export const defaultFieldPositions: Record<string, Pos> = {
  learnerName: { x: 50, y: 40 },
  courseTitle: { x: 50, y: 58 },
  date: { x: 30, y: 78 },
  duration: { x: 50, y: 78 },
  issuerName: { x: 70, y: 78 },
  verificationCode: { x: 50, y: 92 },
  qrCode: { x: 88, y: 88 },
};
export const defaultFieldFontSizes: Record<string, number> = {
  learnerName: 15, courseTitle: 13, date: 10, duration: 10, issuerName: 10, verificationCode: 9,
};
export const defaultFields: Record<string, boolean> = {
  learnerName: true, courseTitle: true, date: true, duration: true, verificationCode: true, issuerName: true, qrCode: true,
};
export const fieldChoices: [string, string][] = [
  ["learnerName", "Learner name"],
  ["courseTitle", "Course title"],
  ["date", "Completion date"],
  ["duration", "Duration"],
  ["issuerName", "Issuing organization"],
  ["verificationCode", "Verification code"],
  ["qrCode", "QR code (links to verification page)"],
];

export interface CertSample {
  learnerName: string; courseTitle: string; date: string; duration: string; issuerName: string; code: string;
}
export const certSampleData: CertSample = {
  learnerName: "Jordan Lee", courseTitle: "Sample Course Title", date: "Sep 14, 2026", duration: "1.5 hrs", issuerName: "Riosmart LMS", code: "SAMPLE-0000",
};

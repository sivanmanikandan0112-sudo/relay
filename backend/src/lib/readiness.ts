import type { ReadinessStatus } from "@prisma/client";

export function statusForScore(score: number): ReadinessStatus {
  if (score < 40) return "BACK_OFF";
  if (score < 65) return "EASE_BACK";
  return "READY";
}

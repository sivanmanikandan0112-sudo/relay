import { prisma } from "./prisma.js";
import { dayKey, groupByDay } from "./date.js";

export interface CheckinRatePoint {
  date: string; // "YYYY-MM-DD"
  checkedIn: number; // distinct athletes who checked in that day
  total: number; // roster size this rate is computed against
  rate: number | null; // checkedIn/total, 0-1 -- null when total is 0 (no one rostered, not "0%")
}

/**
 * A zero-filled, oldest-first daily check-in-rate series for exactly
 * `days` days through today, for a given set of athlete IDs -- the same
 * shape as routes/admin.ts's system-wide activity endpoints, just scoped
 * to whatever roster the caller passes in (a coach's own squad, a
 * school's shared roster, or the system-wide active set) instead of
 * always being every athlete everywhere.
 *
 * `total` is deliberately the *current* roster size held constant across
 * every day in the series, not a historical reconstruction of who was
 * rostered on each past day -- this app doesn't track roster membership
 * over time (CoachAthlete has no "removed at" column), so today's roster
 * is the only "who counts" answer available. Same simplification
 * lib/scoring.ts and the admin overview's own checkinRate already make
 * elsewhere in this codebase.
 */
export async function checkinRateSeries(athleteIds: string[], days: number, now: Date = new Date()): Promise<CheckinRatePoint[]> {
  const total = athleteIds.length;
  const start = new Date(now.getTime() - days * 86400000);

  const entries =
    total === 0
      ? []
      : await prisma.wellnessEntry.findMany({
          where: { athleteId: { in: athleteIds }, date: { gte: start, lte: now } },
          select: { date: true },
        });

  const counts = new Map<number, number>();
  // WellnessEntry is already at most one row per athlete per day (see
  // routes/wellness.ts), so a plain per-day row count already equals
  // "distinct athletes who checked in" -- same reasoning
  // routes/admin.ts's /activity/checkins already relies on.
  for (const { day, items } of groupByDay(entries, (e) => e.date)) counts.set(day.getTime(), items.length);

  const seriesStart = dayKey(new Date(now.getTime() - (days - 1) * 86400000));
  const out: CheckinRatePoint[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(seriesStart.getTime() + i * 86400000);
    const checkedIn = counts.get(day.getTime()) ?? 0;
    out.push({ date: day.toISOString().slice(0, 10), checkedIn, total, rate: total > 0 ? checkedIn / total : null });
  }
  return out;
}

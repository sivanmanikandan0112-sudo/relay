import { prisma } from "./prisma.js";
import { localDayKey } from "./date.js";

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
 * Queries and buckets directly on WellnessEntry.day, not the raw `date`
 * timestamp -- `day` is already the correctly-resolved local calendar day
 * a submission belongs to (see resolveSubmissionDay), so there's nothing
 * left to re-derive. This function used to re-bucket from `date` via
 * dayKey (UTC truncation of the raw timestamp) and anchor "today" on raw
 * server UTC -- both wrong in the same way: a real evening check-in,
 * correctly filed under today's `day`, could get silently miscounted as
 * tomorrow once UTC's calendar day rolled over ahead of Central time
 * (roughly 7pm-midnight Central, every day), and "today" itself could
 * point at a UTC day nobody's local clock had reached yet -- together
 * making the very last point in this series (what every caller reads as
 * "today") read 0% for a school that had genuinely already checked in.
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
  const today = localDayKey(now);
  const seriesStart = new Date(today.getTime() - (days - 1) * 86400000);

  const entries =
    total === 0
      ? []
      : await prisma.wellnessEntry.findMany({
          where: { athleteId: { in: athleteIds }, day: { gte: seriesStart, lte: today } },
          select: { day: true },
        });

  const counts = new Map<number, number>();
  // WellnessEntry is already at most one row per athlete per day (see
  // routes/wellness.ts), so a plain per-day row count already equals
  // "distinct athletes who checked in" -- same reasoning
  // routes/admin.ts's /activity/checkins already relies on.
  for (const e of entries) counts.set(e.day.getTime(), (counts.get(e.day.getTime()) ?? 0) + 1);

  const out: CheckinRatePoint[] = [];
  for (let i = 0; i < days; i++) {
    const day = new Date(seriesStart.getTime() + i * 86400000);
    const checkedIn = counts.get(day.getTime()) ?? 0;
    out.push({ date: day.toISOString().slice(0, 10), checkedIn, total, rate: total > 0 ? checkedIn / total : null });
  }
  return out;
}

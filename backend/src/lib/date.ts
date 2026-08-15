import { ACUTE_WINDOW_DAYS } from "./math.js";

/**
 * Truncates a Date to its UTC calendar day (midnight UTC) -- the day-bucket
 * key WellnessEntry.day is stored as (see schema.prisma), enforcing one
 * check-in per athlete per day, and the grouping key groupByDay below uses
 * to roll multiple same-day TrainingLoad rows into one trend point.
 *
 * UTC, not the submitter's local timezone -- same reasoning as
 * lib/math.ts's currentIsoWeek: deterministic regardless of the server
 * host's own timezone. The app doesn't track a per-user timezone today, so
 * a submission right around local midnight could in rare cases land on
 * the "wrong" UTC day relative to what the athlete perceives as "today" --
 * a pre-existing limitation shared with the readiness pipeline's own
 * week-bucketing, not new here.
 */
export function dayKey(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/**
 * Buckets a chronologically-sorted list of items by their UTC calendar day
 * (via dayKey), returning one { day, items } group per day, in the same
 * order the days first appear. Used to turn "one row per run/entry" data
 * into "one point per day" trend series without assuming anything about
 * how many rows landed on a given day.
 */
export function groupByDay<T>(items: T[], getDate: (item: T) => Date): Array<{ day: Date; items: T[] }> {
  const groups = new Map<number, { day: Date; items: T[] }>();
  for (const item of items) {
    const day = dayKey(getDate(item));
    const key = day.getTime();
    const existing = groups.get(key);
    if (existing) existing.items.push(item);
    else groups.set(key, { day, items: [item] });
  }
  return [...groups.values()];
}

// How far back an athlete can backdate a check-in or run. Reuses
// ACUTE_WINDOW_DAYS rather than inventing a new constant -- a week is
// enough to catch up after a missed weekend without opening a wide-open
// history-editing surface, and it's already the exact window that drives
// the acute load calc, so nothing further back than this meaningfully
// moves this week's own readiness number anyway.
export const BACKDATE_WINDOW_DAYS = ACUTE_WINDOW_DAYS;

export interface ResolvedSubmissionDay {
  day: Date; // UTC calendar day (midnight) -- for WellnessEntry.day / grouping
  date: Date; // the timestamp to actually stamp the row with
}

/**
 * Resolves the (day, date) pair a check-in/run should be stored under,
 * given an optional caller-supplied "YYYY-MM-DD" dayInput. Returns null
 * if dayInput is malformed, in the future, or further back than
 * BACKDATE_WINDOW_DAYS -- callers should 400 on null.
 *
 * Omitting dayInput entirely keeps today's exact existing behavior
 * (stamped with the live `now`, to the second) -- this function only
 * changes anything once a caller actually asks for a past day.
 *
 * A resolved past day is stamped at noon UTC rather than midnight, so it
 * lands unambiguously inside that calendar day under every gte/lte range
 * query in this codebase (all of which compare against a `now` reading,
 * never another midnight) without a timezone-boundary case shoving it a
 * millisecond into the wrong day.
 */
export function resolveSubmissionDay(now: Date, dayInput?: string): ResolvedSubmissionDay | null {
  const today = dayKey(now);
  if (dayInput === undefined) return { day: today, date: now };

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dayInput)) return null;
  const parsed = new Date(`${dayInput}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  const day = dayKey(parsed);

  if (day.getTime() > today.getTime()) return null; // no future submissions
  const floor = today.getTime() - (BACKDATE_WINDOW_DAYS - 1) * 86400000;
  if (day.getTime() < floor) return null; // outside the allowed lookback window

  if (day.getTime() === today.getTime()) return { day, date: now };
  return { day, date: new Date(day.getTime() + 12 * 3600000) };
}

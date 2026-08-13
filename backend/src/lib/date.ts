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

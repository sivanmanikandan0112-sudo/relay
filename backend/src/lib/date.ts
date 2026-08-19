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
 * Same idea as dayKey(), but truncates to the calendar day America/Chicago
 * sees, not UTC. dayKey() is exactly right when a caller already resolved
 * a *specific* local day itself and just needs it encoded consistently --
 * that's exactly what resolveSubmissionDay does below with a caller-
 * supplied "YYYY-MM-DD" (the frontend's own todayKey() already picked the
 * athlete's real local day before sending it), so dayKey() of that string
 * needs no further timezone awareness.
 *
 * This function is for the opposite situation: server-side code with no
 * caller-supplied local day to anchor to at all -- "what day is it right
 * now" for activity stats, check-in-rate series, and login-event
 * bucketing. Falling back to dayKey(new Date()) there means "today" is
 * whatever the server's raw UTC day happens to be, which runs a full
 * calendar day ahead of Central time for several hours every single
 * evening (roughly 7pm-midnight Central, before UTC has rolled past
 * midnight) -- so a coach checking the board at 8pm sees "0 checked in
 * today" while the real check-ins sit in what this code would call
 * "yesterday". This app doesn't track a per-athlete/coach timezone (see
 * resolveSubmissionDay's own comment below), so this can't be correct for
 * every user everywhere -- but it's the same single-timezone assumption
 * the daily push reminder cron already makes explicit (see index.ts's own
 * `timezone: "America/Chicago"`), and matches this app's actual user base
 * far more often than raw server UTC does.
 */
export function localDayKey(date: Date): Date {
  // en-CA formats as "YYYY-MM-DD" -- exactly the shape a plain
  // `${ymd}T00:00:00.000Z` parse expects, so this reuses the same
  // "encode a Y-M-D as UTC midnight" convention as dayKey() itself
  // without hand-rolling the timezone offset math (which would also need
  // to know about DST transitions).
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(date);
  return new Date(`${ymd}T00:00:00.000Z`);
}

/**
 * The hour (0-23) America/Chicago's wall clock reads at this instant --
 * same reference timezone as localDayKey, just the hour component instead
 * of the day. Backs the configurable per-athlete/per-coach reminder hour
 * (User.reminderHour, see lib/pushReminder.ts) -- the hourly cron in
 * index.ts calls this once per run and only sends to whoever's own
 * effective hour matches it.
 *
 * `hourCycle: "h23"` is deliberate, not `hour12: false` -- some JS
 * engines' `hour12: false` still reports local midnight as "24" rather
 * than "0" (an long-standing Intl quirk), which would make `Number(...)`
 * parse to 24 and never match any of the 0-23 hours this app actually
 * offers. `h23` is unambiguous by definition.
 */
export function localHour(date: Date): number {
  return Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23" }).format(date));
}

/**
 * Buckets a chronologically-sorted list of items by calendar day (via
 * dayKey by default, or a caller-supplied keyFn -- e.g. localDayKey, for
 * data with no pre-resolved local-day field to group on directly, like
 * TrainingLoad's raw `date`), returning one { day, items } group per day,
 * in the same order the days first appear. Used to turn "one row per
 * run/entry" data into "one point per day" trend series without assuming
 * anything about how many rows landed on a given day.
 */
export function groupByDay<T>(
  items: T[],
  getDate: (item: T) => Date,
  keyFn: (date: Date) => Date = dayKey
): Array<{ day: Date; items: T[] }> {
  const groups = new Map<number, { day: Date; items: T[] }>();
  for (const item of items) {
    const day = keyFn(getDate(item));
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
 *
 * "today" here is anchored via localDayKey, not dayKey -- the same reason
 * localDayKey exists at all (see its own comment above): using raw UTC
 * would make the future-submission guard and the backdate-window floor
 * both silently shift a day early during the evening window (roughly
 * 7pm-midnight Central), rejecting a legitimate 7-day-old backdate one
 * day sooner than it should. Doesn't affect the (now much rarer)
 * dayInput===undefined branch's own result in practice -- both frontend
 * callers always send an explicit day -- but keeps this function's
 * definition of "today" consistent with everywhere else in the app that
 * needs one without a caller-supplied local day of its own.
 */
export function resolveSubmissionDay(now: Date, dayInput?: string): ResolvedSubmissionDay | null {
  const today = localDayKey(now);
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

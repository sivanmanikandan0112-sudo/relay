/**
 * ISO-8601 week number for a date (weeks run Mon-Sun; the week containing
 * a year's first Thursday is week 1) -- mirrors the backend's own
 * lib/math.ts currentIsoWeek (that one also returns the week-year, since
 * ReadinessScore rows are keyed on both; this one only needs the week
 * number, since every caller here already calls date.getFullYear()
 * separately for the year half). Was previously copy-pasted identically
 * into Brief.tsx, Layout.tsx, and Dashboard.tsx -- harmless while all
 * three agreed, but a real drift risk the moment only one of them ever
 * got touched.
 */
export function currentIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

// green good · amber watch · red low
export function ratingColor(value: number): string {
  if (value <= 2) return "#cf5236";
  if (value === 3) return "#d9a53c";
  return "#4ea373";
}

// Soreness is inverted — high soreness is bad.
export function sorenessColor(value: number): string {
  return ratingColor(6 - value);
}

export function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Mirrors the backend's lib/date.ts BACKDATE_WINDOW_DAYS (which itself
// reuses ACUTE_WINDOW_DAYS) -- how many days back an athlete can log a
// check-in or run for, today included.
export const BACKDATE_WINDOW_DAYS = 7;

/**
 * "YYYY-MM-DD" for a Date in the *browser's own local timezone* --
 * deliberately NOT `now.toISOString().slice(0, 10)`, which is always UTC.
 * That used to be this function's whole implementation, and it's a real
 * bug for anyone west of UTC (i.e. every US timezone): from local evening
 * until UTC midnight, UTC's calendar day has already rolled over to
 * "tomorrow" while the athlete is still very much living in "today". An
 * evening check-in submitted with no explicit `day` (see AthleteCheckin.tsx
 * /AthleteRuns.tsx, which both now always pass this value through
 * explicitly rather than ever omitting it) would silently land on the
 * backend's UTC "today", which the *next* calendar day's local-morning
 * page load would then also call "today" -- pre-filling the form with
 * last night's answers as if already submitted, while the real
 * yesterday showed nothing at all. Central time hits this for roughly
 * 7pm-midnight local, every single day -- not a rare edge case.
 */
export function todayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** "YYYY-MM-DD" -> "Today" / "Yesterday" / "Mon, Jan 5", for a backdating picker. */
export function dayLabel(dayStr: string, now: Date = new Date()): string {
  const diffDays = Math.round((new Date(`${todayKey(now)}T00:00:00Z`).getTime() - new Date(`${dayStr}T00:00:00Z`).getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return new Date(`${dayStr}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
}

/** The last `windowDays` days (today first, oldest last) as {value, label} options for a backdating <select>. */
export function recentDayOptions(windowDays: number = BACKDATE_WINDOW_DAYS, now: Date = new Date()): Array<{ value: string; label: string }> {
  return Array.from({ length: windowDays }, (_, i) => {
    // Local calendar-day subtraction (not a raw i*86400000ms shift, which
    // would fight a DST transition by up to an hour) -- same local-day
    // reasoning as todayKey() above, so every value in this list lines up
    // with what todayKey() calls "today".
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    return { value: todayKey(d), label: dayLabel(todayKey(d), now) };
  });
}

/**
 * The current consecutive-day check-in streak, ending today (or
 * yesterday, if today's check-in just hasn't happened *yet* -- a streak
 * shouldn't read as broken while there's still time left in the day to
 * keep it alive). Previously this wasn't computed at all -- the UI just
 * reused the same "how many check-ins in the last 30 days" count for
 * both "X check-ins" and "X-day streak", which silently mislabeled any
 * non-consecutive history (e.g. 15 check-ins spread across a gappy
 * 30-day window would have read as a false "15-day streak"). `dayStrs`
 * only needs to be the set of days with an entry -- callers pass
 * `history.map(h => h.day.slice(0, 10))`.
 */
export function computeStreak(dayStrs: string[], now: Date = new Date()): number {
  const days = new Set(dayStrs);
  const cursor = new Date(now);
  if (!days.has(todayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(todayKey(cursor))) return 0; // neither today nor yesterday -- streak's broken
  }
  let streak = 0;
  while (days.has(todayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The public accept-invite URL for a given invite token -- shared by every place that offers a "copy invite link" fallback for when email sending isn't configured (or a coach just wants to share it directly). */
export function acceptInviteUrl(token: string): string {
  return `${window.location.origin}/accept-invite/${token}`;
}

export function withinLastDays(iso: string, days: number, now: Date = new Date()): boolean {
  const since = now.getTime() - days * 86400000;
  return new Date(iso).getTime() >= since;
}

// Fractional minutes -> "H:MM:SS" (or "MM:SS" under an hour), for display.
export function formatDuration(minutes: number): string {
  const totalSeconds = Math.round(minutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// Fractional minutes-per-mile -> "M:SS/mi", the standard pace format --
// same rounding idea as formatDuration, just without the hours place
// (paces don't run that slow) and with the "/mi" unit suffix baked in.
export function formatPace(minPerMile: number): string {
  const totalSeconds = Math.round(minPerMile * 60);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}/mi`;
}

// Hour-of-day (0-23) -> "4:00 PM", for the reminder-hour picker on
// Profile.tsx. Mirrors backend's User.reminderHour -- an on-the-hour
// value, no minutes, so this always renders ":00".
export function formatHour(hour: number): string {
  const period = hour < 12 ? "AM" : "PM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}:00 ${period}`;
}

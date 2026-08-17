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

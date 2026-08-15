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

/** Today's date as a "YYYY-MM-DD" string, in UTC -- matches how the backend keys days. */
export function todayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
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
    const value = new Date(now.getTime() - i * 86400000).toISOString().slice(0, 10);
    return { value, label: dayLabel(value, now) };
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

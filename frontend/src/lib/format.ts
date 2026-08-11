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

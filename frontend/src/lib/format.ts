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

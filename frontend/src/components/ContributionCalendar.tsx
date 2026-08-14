interface DailyActivityPoint {
  date: string; // "YYYY-MM-DD"
  count: number;
}

interface Props {
  data: DailyActivityPoint[]; // oldest first, one point per day, zero-filled -- see routes/admin.ts's activity endpoints
  label: string; // singular noun for the tooltip, e.g. "check-in", "run", "login"
  colorVar: string; // base color; intensity tiers are this color at increasing opacity, not four separate colors
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CELL = 12;
const GAP = 3;

// GitHub-contribution-graph style: weeks as columns (Sun top, Sat bottom),
// intensity relative to the busiest day in the window -- there's no
// meaningful fixed scale across three very different metrics (a school's
// total check-ins vs. a handful of coaches logging in), so each calendar
// scales to its own data, same as GitHub's own.
export function ContributionCalendar({ data, label, colorVar }: Props) {
  if (data.length === 0) return null;

  // Pad the front so the first real day lands in the correct day-of-week
  // row -- everything before it is a blank (non-rendered) cell, not a
  // real zero day.
  const firstDay = new Date(`${data[0].date}T00:00:00Z`).getUTCDay();
  const padded: Array<DailyActivityPoint | null> = [...Array(firstDay).fill(null), ...data];

  const weeks: Array<Array<DailyActivityPoint | null>> = [];
  for (let i = 0; i < padded.length; i += 7) weeks.push(padded.slice(i, i + 7));

  const max = Math.max(...data.map((d) => d.count), 0);

  function tier(count: number): number {
    if (count === 0 || max === 0) return 0;
    return Math.min(4, Math.max(1, Math.ceil((count / max) * 4)));
  }

  function opacity(t: number): number {
    return [0, 0.28, 0.52, 0.76, 1][t];
  }

  function formatDate(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCDate()}`;
  }

  // A month label goes above the first week-column whose first *present*
  // (non-padding) day falls in that month, so each month gets exactly one
  // label positioned at where it actually starts.
  const monthLabels: Array<{ week: number; text: string }> = [];
  let lastMonth = -1;
  weeks.forEach((week, w) => {
    const firstReal = week.find((d) => d != null);
    if (!firstReal) return;
    const month = new Date(`${firstReal.date}T00:00:00Z`).getUTCMonth();
    if (month !== lastMonth) {
      monthLabels.push({ week: w, text: MONTH_NAMES[month] });
      lastMonth = month;
    }
  });

  const gridWidth = weeks.length * (CELL + GAP);

  return (
    <div style={{ overflowX: "auto" }}>
      <div style={{ position: "relative", height: 14, width: gridWidth, marginBottom: 4 }}>
        {monthLabels.map(({ week, text }) => (
          <div
            key={week}
            style={{
              position: "absolute",
              left: week * (CELL + GAP),
              fontSize: 10.5,
              fontFamily: "var(--font-mono)",
              color: "var(--text-dim)",
            }}
          >
            {text}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: GAP }}>
        {weeks.map((week, w) => (
          <div key={w} style={{ display: "flex", flexDirection: "column", gap: GAP }}>
            {week.map((day, d) =>
              day ? (
                <div
                  key={d}
                  title={`${day.count} ${label}${day.count === 1 ? "" : "s"} on ${formatDate(day.date)}`}
                  style={{
                    width: CELL,
                    height: CELL,
                    borderRadius: 2,
                    background: day.count === 0 ? "var(--border)" : colorVar,
                    opacity: day.count === 0 ? 1 : opacity(tier(day.count)),
                  }}
                />
              ) : (
                <div key={d} style={{ width: CELL, height: CELL }} />
              )
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, justifyContent: "flex-end" }}>
        <span style={{ fontSize: 10.5, color: "var(--text-dim)", marginRight: 2 }}>Less</span>
        <div style={{ width: CELL, height: CELL, borderRadius: 2, background: "var(--border)" }} />
        {[1, 2, 3, 4].map((t) => (
          <div key={t} style={{ width: CELL, height: CELL, borderRadius: 2, background: colorVar, opacity: opacity(t) }} />
        ))}
        <span style={{ fontSize: 10.5, color: "var(--text-dim)", marginLeft: 2 }}>More</span>
      </div>
    </div>
  );
}

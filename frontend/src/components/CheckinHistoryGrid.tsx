import type { WellnessEntry } from "../lib/api";
import { ratingColor, recentDayOptions, sorenessColor } from "../lib/format";

interface Props {
  wellness: WellnessEntry[];
  // How many days back from today this grid covers -- also what builds
  // the actual row list (see below), not just the header text.
  windowDays: number;
  // Coach-only: shows "X/Y days checked in" in the header. Left off for
  // an athlete's own History page -- they already see every gap as its
  // own row right below; a coach scanning a whole roster wants the
  // number available without reading every row first.
  showComplianceCount?: boolean;
}

// Day-by-day check-in grid (sleep/energy/mood/motivation/soreness,
// color-coded), shared between the coach's DetailDrawer and an
// athlete's own AthleteHistory.tsx -- same table, same meaning, just a
// different window of days and a different audience.
//
// Renders one row per *calendar day* in the window, not one row per
// WellnessEntry -- a day with no check-in used to just vanish from the
// list entirely (map() only ever sees rows that exist), so a coach
// scanning the grid had to notice a date jump from the 14th to the 16th
// to realize the 15th was skipped. Every day in the window now gets a
// row regardless; a missing one renders as an explicit "No check-in"
// row instead of silently not existing. This is purely a display fix --
// it doesn't change what the readiness score itself does with a missed
// day (see scoring.ts/math.ts), which already handles a gap correctly.
export function CheckinHistoryGrid({ wellness, windowDays, showComplianceCount }: Props) {
  const entryByDay = new Map(wellness.map((w) => [w.day.slice(0, 10), w]));
  const days = recentDayOptions(windowDays);
  const checkedInCount = days.filter((d) => entryByDay.has(d.value)).length;

  return (
    <>
      <div className="drawer-section-label">
        <span>CHECK-IN HISTORY · LAST {windowDays} DAYS</span>
        {showComplianceCount && (
          <span style={{ color: checkedInCount === windowDays ? "#4ea373" : "var(--text-dim)" }}>
            {checkedInCount}/{windowDays} checked in
          </span>
        )}
      </div>
      <div className="drawer-grid-panel">
        <div className="drawer-grid-head">
          <div />
          <div>SLEEP</div>
          <div>ENGY</div>
          <div>MOOD</div>
          <div>MOTIV</div>
          <div>SORE</div>
        </div>
        {days.map((day) => {
          const entry = entryByDay.get(day.value);
          if (!entry) {
            return (
              <div className="drawer-grid-row drawer-grid-row-gap" key={day.value}>
                <div className="drawer-grid-date">{day.label}</div>
                <div className="drawer-grid-gap-note">No check-in</div>
              </div>
            );
          }
          return (
            <div className="drawer-grid-row" key={entry.id}>
              <div className="drawer-grid-date">{day.label}</div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span className="drawer-chip" style={{ background: ratingColor(entry.sleep) }}>
                  {entry.sleep}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span className="drawer-chip" style={{ background: ratingColor(entry.energy) }}>
                  {entry.energy}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span className="drawer-chip" style={{ background: ratingColor(entry.mood) }}>
                  {entry.mood}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span className="drawer-chip" style={{ background: ratingColor(entry.motivation) }}>
                  {entry.motivation}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <span className="drawer-chip" style={{ background: sorenessColor(entry.soreness) }}>
                  {entry.soreness}
                </span>
              </div>
            </div>
          );
        })}
        <div className="drawer-legend">green good · amber watch · red low — soreness inverted (high = worse)</div>
      </div>
    </>
  );
}

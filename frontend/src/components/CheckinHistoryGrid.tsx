import type { WellnessEntry } from "../lib/api";
import { formatShortDate, ratingColor, sorenessColor } from "../lib/format";

interface Props {
  wellness: WellnessEntry[];
  // Caller decides the window (and says so in the label) -- the coach's
  // detail drawer passes a 7-day slice to fit a cramped side panel;
  // AthleteHistory.tsx, a full page with room to breathe, passes a
  // longer one so an athlete can actually see a trend in their own data.
  windowLabel: string;
}

// Day-by-day check-in grid (sleep/energy/mood/motivation/soreness,
// color-coded), shared between the coach's DetailDrawer and an
// athlete's own AthleteHistory.tsx -- same table, same meaning, just a
// different window of days and a different audience.
export function CheckinHistoryGrid({ wellness, windowLabel }: Props) {
  return (
    <>
      <div className="drawer-section-label">CHECK-IN HISTORY · {windowLabel}</div>
      <div className="drawer-grid-panel">
        <div className="drawer-grid-head">
          <div />
          <div>SLEEP</div>
          <div>ENGY</div>
          <div>MOOD</div>
          <div>MOTIV</div>
          <div>SORE</div>
        </div>
        {wellness.map((r) => (
          <div className="drawer-grid-row" key={r.id}>
            <div className="drawer-grid-date">{formatShortDate(r.date)}</div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span className="drawer-chip" style={{ background: ratingColor(r.sleep) }}>
                {r.sleep}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span className="drawer-chip" style={{ background: ratingColor(r.energy) }}>
                {r.energy}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span className="drawer-chip" style={{ background: ratingColor(r.mood) }}>
                {r.mood}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span className="drawer-chip" style={{ background: ratingColor(r.motivation) }}>
                {r.motivation}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <span className="drawer-chip" style={{ background: sorenessColor(r.soreness) }}>
                {r.soreness}
              </span>
            </div>
          </div>
        ))}
        {wellness.length === 0 && <div className="drawer-legend">No check-ins in this window.</div>}
        <div className="drawer-legend">green good · amber watch · red low — soreness inverted (high = worse)</div>
      </div>
    </>
  );
}

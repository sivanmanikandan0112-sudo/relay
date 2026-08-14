import type { Workload } from "../lib/api";
import { CHRONIC_WINDOW_DAYS, STATUS_COLOR } from "../lib/status";

interface Props {
  workload: Workload;
}

const ACUTE_WINDOW_DAYS = 7;

// Section 2 -- phase-gated, unlike AthleteStats.tsx right above this.
// The three phases here are a purely display-confidence layer on top of
// numbers the readiness pipeline already computes for every athlete
// every week (lib/scoring.ts) -- this doesn't change what's stored,
// just how much weight the coach should put on the raw ACWR/risk
// numbers before there's enough history for them to mean anything.
export function WorkloadAnalysis({ workload }: Props) {
  const { phase, daysTracked, acuteLoad, chronicLoad, acwr, risk, status } = workload;
  const days = Math.floor(daysTracked);

  if (phase === "building") {
    const pct = Math.min(100, (daysTracked / ACUTE_WINDOW_DAYS) * 100);
    return (
      <>
        <div className="drawer-section-label">WORKLOAD ANALYSIS</div>
        <div className="drawer-grid-panel">
          <div style={{ fontSize: 12.5, color: "var(--text-dim)", marginBottom: 8 }}>
            Building baseline — acute load available after {ACUTE_WINDOW_DAYS} days of tracking.
          </div>
          <div style={{ height: 6, borderRadius: 4, background: "var(--border)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "#3d9c9c", borderRadius: 4 }} />
          </div>
          <div className="drawer-legend" style={{ marginTop: 6 }}>
            {days} / {ACUTE_WINDOW_DAYS} days
          </div>
        </div>
      </>
    );
  }

  const inconclusive = phase === "partial";
  const color = STATUS_COLOR[status];

  return (
    <>
      <div className="drawer-section-label">
        <span>WORKLOAD ANALYSIS</span>
        {inconclusive ? (
          <span style={{ color: "#d9a53c" }}>
            ⚠ Inconclusive — {days} / {CHRONIC_WINDOW_DAYS} days
          </span>
        ) : (
          <span style={{ color: "#4ea373" }}>✓ Full analysis</span>
        )}
      </div>
      <div className="drawer-stats">
        <div className="drawer-stat">
          <div className="label">ACUTE LOAD</div>
          <div className="value">{acuteLoad.toFixed(0)}</div>
        </div>
        <div className="drawer-stat">
          <div className="label">CHRONIC LOAD</div>
          <div className="value">{chronicLoad.toFixed(0)}</div>
        </div>
        <div className="drawer-stat">
          <div className="label">ACWR</div>
          <div className="value" style={{ color: inconclusive ? "#d9a53c" : color }}>
            {acwr.toFixed(2)}
          </div>
        </div>
        <div className="drawer-stat">
          <div className="label">RISK SCORE</div>
          <div className="value" style={{ color: inconclusive ? "#8a97ad" : color }}>
            {risk.toFixed(0)} <span style={{ fontSize: 10, color: "#5c6880" }}>/100</span>
          </div>
        </div>
      </div>
      {inconclusive && (
        <div className="drawer-legend" style={{ marginTop: 8 }}>
          Risk score becomes reliable after {CHRONIC_WINDOW_DAYS} days of tracking. Use these numbers as
          directional guidance only.
        </div>
      )}
    </>
  );
}

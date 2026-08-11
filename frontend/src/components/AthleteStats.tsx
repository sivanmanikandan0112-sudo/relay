import type { AthleteStats as AthleteStatsData } from "../lib/api";
import { formatPace } from "../lib/format";
import { Sparkline } from "./Sparkline";
import { BarChart } from "./BarChart";

interface Props {
  stats: AthleteStatsData;
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="drawer-stat">
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}

// Section 1 -- always visible, no phase-gating: these numbers are
// meaningful from the athlete's very first logged session, unlike the
// workload/ACWR numbers in WorkloadAnalysis.tsx right below this.
export function AthleteStats({ stats }: Props) {
  return (
    <>
      <div className="drawer-section-label">STATS</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(96px, 1fr))", gap: 8 }}>
        <StatTile label="TOTAL DISTANCE" value={`${stats.totalDistanceMiles.toFixed(1)} mi`} />
        <StatTile label="AVG PACE" value={stats.avgPaceMinPerMile != null ? formatPace(stats.avgPaceMinPerMile) : "—"} />
        <StatTile label="THIS WEEK" value={`${stats.weeklyDistanceMiles.toFixed(1)} mi`} />
        <StatTile label="SESSIONS" value={String(stats.sessionCount)} />
        <StatTile label="AVG RPE" value={stats.avgRpe != null ? stats.avgRpe.toFixed(1) : "—"} />
        <StatTile label="AVG SLEEP" value={stats.avgSleep != null ? `${stats.avgSleep.toFixed(1)} / 5` : "—"} />
        <StatTile label="AVG ENERGY" value={stats.avgEnergy != null ? `${stats.avgEnergy.toFixed(1)} / 5` : "—"} />
      </div>

      {stats.distanceSeries.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div className="drawer-legend" style={{ marginBottom: 4 }}>
            DISTANCE OVER TIME
          </div>
          <BarChart values={stats.distanceSeries.map((d) => d.distanceMiles)} colorVar="#3d9c9c" />
        </div>
      )}

      <div style={{ display: "flex", gap: 20, marginTop: 14, flexWrap: "wrap" }}>
        {stats.rpeSeries.length > 0 && (
          <div>
            <div className="drawer-legend" style={{ marginBottom: 4 }}>
              RPE TREND
            </div>
            <Sparkline values={stats.rpeSeries.map((r) => r.rpe)} colorVar="#d9a53c" width={120} height={28} />
          </div>
        )}
        {stats.paceSeries.length > 0 && (
          <div>
            <div className="drawer-legend" style={{ marginBottom: 4 }}>
              PACE TREND · lower = faster
            </div>
            <Sparkline values={stats.paceSeries.map((p) => p.paceMinPerMile)} colorVar="#4ea373" width={120} height={28} />
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap" }}>
        {stats.sleepSeries.length > 0 && (
          <div>
            <div className="drawer-legend" style={{ marginBottom: 4 }}>
              SLEEP
            </div>
            <Sparkline values={stats.sleepSeries.map((s) => s.value)} colorVar="#7fb0d9" width={90} height={22} />
          </div>
        )}
        {stats.energySeries.length > 0 && (
          <div>
            <div className="drawer-legend" style={{ marginBottom: 4 }}>
              ENERGY
            </div>
            <Sparkline values={stats.energySeries.map((s) => s.value)} colorVar="#d97fb0" width={90} height={22} />
          </div>
        )}
      </div>
    </>
  );
}

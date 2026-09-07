import { useEffect, useState } from "react";
import { api, type AthleteStatsResponse, type Note, type Run, type WellnessEntry } from "../lib/api";
import { formatDuration, formatShortDate, withinLastDays } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { AthleteStats } from "../components/AthleteStats";
import { WorkloadAnalysis } from "../components/WorkloadAnalysis";
import { CheckinHistoryGrid } from "../components/CheckinHistoryGrid";

// A window wide enough to actually show a trend, not just "what did I do
// this week" -- the coach's own detail-drawer equivalent uses 7 days
// because it's a cramped side panel; this is a full page an athlete
// visits specifically to look back, so it gets more room. The trend
// charts inside AthleteStats itself aren't day-windowed at all (they
// already span an athlete's entire logged history) -- this only bounds
// the two literal day-by-day lists below them.
const HISTORY_WINDOW_DAYS = 30;

// Read-only: logging a run moved to the Check-in page (see its own
// comment on why -- runs are half the readiness signal, and a separate
// tab was too easy to skip entirely). This page is purely for looking
// back -- the trend charts and day-by-day logs an athlete's own history
// makes possible, plus removing a past run logged in error.
export function AthleteHistory() {
  const { user } = useAuth();
  const athleteId = user?.athleteId ?? null;
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [stats, setStats] = useState<AthleteStatsResponse | null>(null);

  function refresh() {
    if (!athleteId) return;
    api.wellnessForAthlete(athleteId).then(setWellness);
    api.runsForAthlete(athleteId).then(setRuns);
    api.notesForAthlete(athleteId).then(setNotes);
    api.athleteStats(athleteId).then(setStats);
  }

  useEffect(refresh, [athleteId]);

  if (!athleteId) {
    return (
      <div className="ath-wrap-runs">
        <p className="page-subtitle">
          Your account isn't linked to an athlete profile yet — ask your coach to set that up.
        </p>
      </div>
    );
  }

  async function handleDelete(id: string) {
    await api.deleteRun(id);
    refresh();
  }

  const recentRuns = runs.filter((r) => withinLastDays(r.date, HISTORY_WINDOW_DAYS));

  return (
    <div className="ath-wrap-runs">
      <h1 className="page-title" style={{ margin: "0 0 4px" }}>
        Your history
      </h1>
      <p className="page-subtitle" style={{ margin: "0 0 16px" }}>
        Everything you've logged, in one place — trends over time, plus the day-by-day record behind
        them. Log today's check-in and any runs from the Check-in page.
      </p>

      {stats && <AthleteStats stats={stats.stats} />}

      {/* Workload/ACWR/risk gated the same way the readiness score itself
          is (off by default) -- these numbers are effectively the same
          overtraining signal in a different shape, so showing them
          regardless would quietly undo the whole reason that score stays
          coach-only until an athlete deliberately opts in. */}
      {user?.readinessShared && stats && <WorkloadAnalysis workload={stats.workload} />}

      <div style={{ marginTop: 20 }}>
        {/* Full wellness history passed in, not a pre-filtered slice --
            the grid derives its own exact calendar-day window internally
            (recentDayOptions), so it can correctly tell "checked in" from
            "gap" for every day in that window without depending on
            withinLastDays' rolling 24h cutoff possibly excluding a real
            entry right at the boundary. */}
        <CheckinHistoryGrid wellness={wellness} windowDays={HISTORY_WINDOW_DAYS} />
      </div>

      <div className="field-hint" style={{ margin: "20px 0 8px" }}>
        RUNS · LAST {HISTORY_WINDOW_DAYS} DAYS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {recentRuns.map((r) => (
          <div className="run-item" key={r.id}>
            <div className="run-item-row">
              <div className="run-item-date">{formatShortDate(r.date)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="run-item-type">{r.runType}</div>
                <div className="run-item-meta">
                  {r.distanceMiles != null ? `${r.distanceMiles.toFixed(2)}mi · ` : ""}
                  {formatDuration(r.durationMin)} · effort {r.rpe}/10
                </div>
              </div>
              <button className="run-item-delete" title="Remove run" onClick={() => handleDelete(r.id)}>
                ×
              </button>
            </div>
          </div>
        ))}
        {recentRuns.length === 0 && <p className="page-subtitle">No runs in this window.</p>}
      </div>

      {notes.length > 0 && (
        <>
          <div className="field-hint" style={{ margin: "20px 0 8px" }}>
            NOTES FROM YOUR COACH
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notes.map((n) => (
              <div className="run-note" key={n.id} style={{ borderRadius: 9, border: "1px solid #5a3f16" }}>
                <span className="icon">✍</span>
                <div>
                  <div className="date">
                    {n.coach.name} · {formatShortDate(n.createdAt)}
                  </div>
                  <div className="text">{n.body}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

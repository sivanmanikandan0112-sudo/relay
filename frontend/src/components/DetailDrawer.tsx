import { useEffect, useState } from "react";
import {
  api,
  type AthleteDetail,
  type AthleteStatsResponse,
  type Note,
  type ReadinessScoreRecord,
  type Run,
  type WellnessEntry,
} from "../lib/api";
import { STATUS_COLOR, STATUS_LABEL, dataConfidence, scoreIsMeaningful } from "../lib/status";
import { formatDuration, formatShortDate, initials, ratingColor, sorenessColor, withinLastDays } from "../lib/format";
import { NoteModal } from "./NoteModal";
import { AthleteStats } from "./AthleteStats";
import { WorkloadAnalysis } from "./WorkloadAnalysis";

interface DetailDrawerProps {
  athleteId: string;
  onClose: () => void;
  // Called after a successful "Remove from roster" -- lets the parent
  // page (Brief/Dashboard) refetch its own athlete list so the removed
  // athlete actually disappears from it, not just from this drawer.
  onRemoved?: () => void;
}

const SQUAD_LABEL: Record<string, string> = { GIRLS: "Girls squad", BOYS: "Boys squad" };

export function DetailDrawer({ athleteId, onClose, onRemoved }: DetailDrawerProps) {
  const [athlete, setAthlete] = useState<AthleteDetail | null>(null);
  const [history, setHistory] = useState<ReadinessScoreRecord[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [athleteStats, setAthleteStats] = useState<AthleteStatsResponse | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);

  // --- Remove from roster ------------------------------------------
  const [removeConfirming, setRemoveConfirming] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);

  function refresh() {
    api.athleteDetail(athleteId).then(setAthlete);
    api.readinessHistory(athleteId).then(setHistory);
    api.wellnessForAthlete(athleteId).then(setWellness);
    api.runsForAthlete(athleteId).then(setRuns);
    api.notesForAthlete(athleteId).then(setNotes);
    api.athleteStats(athleteId).then(setAthleteStats);
  }

  useEffect(refresh, [athleteId]);

  async function handleRemove() {
    setRemoveError(null);
    setRemoving(true);
    try {
      await api.removeFromRoster(athleteId);
      onRemoved?.();
      onClose();
    } catch (err) {
      setRemoveError(err instanceof Error ? err.message : "Couldn't remove them from your roster");
      setRemoving(false);
    }
  }

  if (!athlete) return null;

  const latest = history[history.length - 1];
  const prev = history[history.length - 2];
  let trendArrow = "→";
  let trendVal = "steady";
  let trendColor = "#8a97ad";
  if (latest && prev && scoreIsMeaningful(latest.status) && scoreIsMeaningful(prev.status)) {
    const diff = latest.score - prev.score;
    trendArrow = diff > 2 ? "▲" : diff < -2 ? "▼" : "→";
    trendVal = `${diff > 0 ? "+" : ""}${diff}`;
    trendColor = diff > 2 ? "#4ea373" : diff < -2 ? "#cf5236" : "#8a97ad";
  }

  const statusColor = latest ? STATUS_COLOR[latest.status] : "#4ea373";
  const confidence = latest ? dataConfidence(latest.daysOfHistory) : null;
  const lastWeekWellness = wellness.filter((w) => withinLastDays(w.date, 7));
  const lastWeekRuns = runs.filter((r) => withinLastDays(r.date, 7));
  const messages = lastWeekWellness.filter((w) => w.msg);

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose}>
        <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
          <div className="drawer-head">
            <div className="drawer-avatar" style={{ background: statusColor }}>
              {initials(athlete.name)}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="drawer-name">{athlete.name}</div>
              <div className="drawer-sub">{SQUAD_LABEL[athlete.squad.name]}</div>
            </div>
            <button className="drawer-close" onClick={onClose}>
              ×
            </button>
          </div>

          {latest && (
            <div className="drawer-plain" style={{ background: "#12140b", border: "1px solid #3a3f1e", borderLeft: "3px solid #d9703f" }}>
              {latest.summary}
            </div>
          )}

          <div className="drawer-stats">
            <div className="drawer-stat">
              <div className="label">STATUS</div>
              <div className="value" style={{ color: statusColor, textTransform: "uppercase" }}>
                {latest ? STATUS_LABEL[latest.status] : "—"}
              </div>
            </div>
            {latest && scoreIsMeaningful(latest.status) && (
              <div className="drawer-stat">
                <div className="label">READINESS</div>
                <div className="value" style={{ color: statusColor }}>
                  {latest.score} <span style={{ fontSize: 10, color: "#5c6880" }}>/100</span>
                </div>
              </div>
            )}
            <div className="drawer-stat">
              <div className="label">MULTI-WEEK TREND</div>
              <div className="value" style={{ color: trendColor }}>
                {trendArrow} {trendVal}
              </div>
            </div>
          </div>

          {latest && scoreIsMeaningful(latest.status) && confidence && (
            <div className="drawer-legend" style={{ color: confidence.color, marginTop: -6, marginBottom: 8 }}>
              ⚠ {confidence.detail}
            </div>
          )}

          {athleteStats && <AthleteStats stats={athleteStats.stats} />}
          {athleteStats && <WorkloadAnalysis workload={athleteStats.workload} />}

          <div className="drawer-section-label">CHECK-IN HISTORY · LAST 7 DAYS</div>
          <div className="drawer-grid-panel">
            <div className="drawer-grid-head">
              <div />
              <div>SLEEP</div>
              <div>ENGY</div>
              <div>MOOD</div>
              <div>MOTIV</div>
              <div>SORE</div>
            </div>
            {lastWeekWellness.map((r) => (
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
            {lastWeekWellness.length === 0 && <div className="drawer-legend">No check-ins in the last 7 days.</div>}
            <div className="drawer-legend">green good · amber watch · red low — soreness inverted (high = worse)</div>
          </div>

          {messages.length > 0 && (
            <>
              <div className="drawer-section-label">WHAT THEY TOLD YOU</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {messages.map((m) => (
                  <div className="drawer-msg-card" key={m.id}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8a97ad", marginBottom: 3 }}>
                      {formatShortDate(m.date)}
                    </div>
                    <div style={{ fontSize: 13.5, color: "#c3cddd", lineHeight: 1.5 }}>“{m.msg}”</div>
                  </div>
                ))}
              </div>
            </>
          )}

          <div className="drawer-section-label">RUNS · LAST 7 DAYS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {lastWeekRuns.map((r) => (
              <div className="drawer-run-card" key={r.id}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8a97ad", width: 42, flex: "none" }}>
                  {formatShortDate(r.date)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>{r.runType}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8a97ad" }}>
                    {r.distanceMiles ? `${r.distanceMiles.toFixed(2)}mi · ` : ""}
                    {formatDuration(r.durationMin)} · RPE {r.rpe}/10
                  </div>
                </div>
              </div>
            ))}
            {lastWeekRuns.length === 0 && <div className="drawer-legend">No runs in the last 7 days.</div>}
          </div>

          <div className="drawer-section-label">
            <span>YOUR NOTES TO THEM</span>
            <button className="drawer-note-btn" onClick={() => setNoteOpen(true)}>
              + Leave a note
            </button>
          </div>
          {notes.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {notes.map((n) => (
                <div className="drawer-note-card" key={n.id}>
                  <div className="by">
                    {n.coach.name} · {formatShortDate(n.createdAt)}
                  </div>
                  <div className="text">{n.body}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="drawer-legend">No notes yet — leave one to close the loop.</div>
          )}

          <div className="drawer-section-label" style={{ marginTop: 20 }}>
            <span>ROSTER</span>
          </div>
          {!removeConfirming ? (
            <button className="btn-secondary" style={{ color: "var(--red)", borderColor: "var(--red)" }} onClick={() => setRemoveConfirming(true)}>
              Remove from roster
            </button>
          ) : (
            <div className="drawer-plain" style={{ borderLeft: "3px solid var(--red)" }}>
              <p style={{ margin: 0, fontSize: 13 }}>
                Remove {athlete.name} from your team's active roster? Their check-in history, runs, and readiness
                scores are all kept exactly as they are — this only takes them off the roster, same as an athlete
                who hasn't been added yet. Re-invite or approve them again later and everything picks right back
                up.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button className="btn-primary" style={{ background: "var(--red)" }} disabled={removing} onClick={handleRemove}>
                  {removing ? "Removing…" : "Yes, remove them"}
                </button>
                <button className="btn-secondary" disabled={removing} onClick={() => setRemoveConfirming(false)}>
                  Cancel
                </button>
              </div>
              {removeError && (
                <p className="error" style={{ marginTop: 8 }}>
                  {removeError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {noteOpen && (
        <NoteModal
          athleteId={athleteId}
          athleteName={athlete.name}
          onClose={() => setNoteOpen(false)}
          onSaved={() => {
            setNoteOpen(false);
            refresh();
          }}
        />
      )}
    </>
  );
}

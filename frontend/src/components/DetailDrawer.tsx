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
import { formatDuration, formatShortDate, initials, todayKey, withinLastDays } from "../lib/format";
import { NoteModal } from "./NoteModal";
import { InjuryModal } from "./InjuryModal";
import { AthleteStats } from "./AthleteStats";
import { WorkloadAnalysis } from "./WorkloadAnalysis";
import { CheckinHistoryGrid } from "./CheckinHistoryGrid";

interface DetailDrawerProps {
  athleteId: string;
  onClose: () => void;
  // Called after a successful "Remove from roster" -- lets the parent
  // page (Brief/Dashboard) refetch its own athlete list so the removed
  // athlete actually disappears from it, not just from this drawer.
  onRemoved?: () => void;
  // Called after logging an injury or changing its status -- both change
  // the athlete's readiness status/score server-side (recomputeReadiness),
  // so the parent's own list needs a refetch too, not just this drawer's
  // local state. Drawer stays open (unlike onRemoved, which closes it).
  onChanged?: () => void;
}

const SQUAD_LABEL: Record<string, string> = { GIRLS: "Girls squad", BOYS: "Boys squad" };

export function DetailDrawer({ athleteId, onClose, onRemoved, onChanged }: DetailDrawerProps) {
  const [athlete, setAthlete] = useState<AthleteDetail | null>(null);
  const [history, setHistory] = useState<ReadinessScoreRecord[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [athleteStats, setAthleteStats] = useState<AthleteStatsResponse | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [injuryModalOpen, setInjuryModalOpen] = useState(false);
  const [injuryUpdating, setInjuryUpdating] = useState(false);
  const [injuryError, setInjuryError] = useState<string | null>(null);
  const [nudging, setNudging] = useState(false);
  const [nudgeFeedback, setNudgeFeedback] = useState<{ ok: boolean; text: string } | null>(null);

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

  async function handleInjuryStatus(id: string, status: "RECOVERING" | "RESOLVED") {
    setInjuryUpdating(true);
    setInjuryError(null);
    try {
      await api.updateInjuryStatus(id, status);
      refresh();
      onChanged?.();
    } catch (err) {
      setInjuryError(err instanceof Error ? err.message : "Couldn't update that injury");
    } finally {
      setInjuryUpdating(false);
    }
  }

  async function handleNudge() {
    setNudging(true);
    setNudgeFeedback(null);
    try {
      const res = await api.nudgeAthlete(athleteId);
      setNudgeFeedback({ ok: true, text: res.sent > 0 ? "Nudge sent." : "Sent, but their device may no longer be reachable." });
    } catch (err) {
      setNudgeFeedback({ ok: false, text: err instanceof Error ? err.message : "Couldn't send a nudge" });
    } finally {
      setNudging(false);
    }
  }

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

  const openInjury = athlete.injuries.find((i) => i.status !== "RESOLVED");
  const resolvedInjuries = athlete.injuries.filter((i) => i.status === "RESOLVED");

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
  const checkedInToday = wellness.some((w) => w.day.slice(0, 10) === todayKey());

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

          {!checkedInToday && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12, flexWrap: "wrap" }}>
              <button className="btn-secondary" disabled={nudging} onClick={handleNudge}>
                {nudging ? "Sending…" : "Nudge to check in"}
              </button>
              {nudgeFeedback && (
                <span style={{ fontSize: 12, color: nudgeFeedback.ok ? "#4ea373" : "var(--red)" }}>{nudgeFeedback.text}</span>
              )}
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

          <CheckinHistoryGrid wellness={lastWeekWellness} windowLabel="LAST 7 DAYS" />

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
            <span>INJURY STATUS</span>
            {!openInjury && (
              <button className="drawer-note-btn" onClick={() => setInjuryModalOpen(true)}>
                + Log injury
              </button>
            )}
          </div>
          {openInjury ? (
            <div
              className="drawer-plain"
              style={{ borderLeft: `3px solid ${openInjury.status === "ACTIVE" ? "#7a8291" : "#3d9c9c"}` }}
            >
              <p style={{ margin: "0 0 10px", fontSize: 13 }}>
                {openInjury.status === "ACTIVE" ? "Out — " : "Return-to-run protocol — "}
                {openInjury.description}
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {openInjury.status === "ACTIVE" && (
                  <button
                    className="btn-secondary"
                    disabled={injuryUpdating}
                    onClick={() => handleInjuryStatus(openInjury.id, "RECOVERING")}
                  >
                    Start return-to-run protocol
                  </button>
                )}
                <button
                  className="btn-secondary"
                  style={{ color: "#4ea373", borderColor: "#234a30" }}
                  disabled={injuryUpdating}
                  onClick={() => handleInjuryStatus(openInjury.id, "RESOLVED")}
                >
                  {injuryUpdating ? "Saving…" : "Mark resolved"}
                </button>
              </div>
              {injuryError && (
                <p className="error" style={{ marginTop: 8 }}>
                  {injuryError}
                </p>
              )}
            </div>
          ) : (
            <div className="drawer-legend">No open injury on record.</div>
          )}
          {resolvedInjuries.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              {resolvedInjuries.map((i) => (
                <div key={i.id} className="drawer-legend" style={{ fontSize: 10.5 }}>
                  ✓ Cleared {new Date(i.startDate).toLocaleDateString()}
                  {i.endDate ? `–${new Date(i.endDate).toLocaleDateString()}` : ""} — {i.description}
                </div>
              ))}
            </div>
          )}

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

      {injuryModalOpen && (
        <InjuryModal
          athleteId={athleteId}
          athleteName={athlete.name}
          onClose={() => setInjuryModalOpen(false)}
          onSaved={() => {
            setInjuryModalOpen(false);
            refresh();
            onChanged?.();
          }}
        />
      )}
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

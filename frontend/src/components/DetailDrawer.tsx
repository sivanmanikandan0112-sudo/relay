import { useEffect, useState } from "react";
import { api, type AthleteDetail, type Note, type ReadinessScoreRecord, type Run, type WellnessEntry } from "../lib/api";
import { STATUS_COLOR, STATUS_LABEL, scoreIsMeaningful } from "../lib/status";
import { formatShortDate, initials, ratingColor, sorenessColor } from "../lib/format";
import { NoteModal } from "./NoteModal";

interface DetailDrawerProps {
  athleteId: string;
  onClose: () => void;
}

const SQUAD_LABEL: Record<string, string> = { GIRLS: "Girls squad", BOYS: "Boys squad" };

export function DetailDrawer({ athleteId, onClose }: DetailDrawerProps) {
  const [athlete, setAthlete] = useState<AthleteDetail | null>(null);
  const [history, setHistory] = useState<ReadinessScoreRecord[]>([]);
  const [wellness, setWellness] = useState<WellnessEntry[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [noteOpen, setNoteOpen] = useState(false);

  function refresh() {
    api.athleteDetail(athleteId).then(setAthlete);
    api.readinessHistory(athleteId).then(setHistory);
    api.wellnessForAthlete(athleteId).then(setWellness);
    api.runsForAthlete(athleteId).then(setRuns);
    api.notesForAthlete(athleteId).then(setNotes);
  }

  useEffect(refresh, [athleteId]);

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
  const messages = wellness.filter((w) => w.msg);
  const gridRows = wellness.slice(0, 7);

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

          <div className="drawer-section-label">CHECK-IN HISTORY · LAST 7 DAYS</div>
          <div className="drawer-grid-panel">
            <div className="drawer-grid-head">
              <div />
              <div>SLEEP</div>
              <div>ENGY</div>
              <div>MOOD</div>
              <div>SORE</div>
            </div>
            {gridRows.map((r) => (
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
                  <span className="drawer-chip" style={{ background: sorenessColor(r.soreness) }}>
                    {r.soreness}
                  </span>
                </div>
              </div>
            ))}
            {gridRows.length === 0 && <div className="drawer-legend">No check-ins logged yet.</div>}
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

          <div className="drawer-section-label">RECENT RUNS</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {runs.slice(0, 3).map((r) => (
              <div className="drawer-run-card" key={r.id}>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8a97ad", width: 42, flex: "none" }}>
                  {formatShortDate(r.date)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 14 }}>{r.runType}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#8a97ad" }}>
                    {r.distanceMiles ? `${r.distanceMiles}mi · ` : ""}
                    {r.durationMin}min · RPE {r.rpe}/10
                  </div>
                </div>
              </div>
            ))}
            {runs.length === 0 && <div className="drawer-legend">No runs logged yet.</div>}
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

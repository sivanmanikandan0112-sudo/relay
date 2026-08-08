import { useEffect, useState } from "react";
import { api, type Note, type Run } from "../lib/api";
import { formatShortDate } from "../lib/format";
import { useAuth } from "../context/AuthContext";

export function AthleteRuns() {
  const { user } = useAuth();
  const athleteId = user?.athleteId ?? null;
  const [runs, setRuns] = useState<Run[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [logType, setLogType] = useState("");
  const [logDist, setLogDist] = useState("");
  const [logTime, setLogTime] = useState("");
  const [logRpe, setLogRpe] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  function refresh() {
    if (!athleteId) return;
    api.runsForAthlete(athleteId).then(setRuns);
    api.notesForAthlete(athleteId).then(setNotes);
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

  const canAdd = logType.trim().length > 0 && logRpe != null;

  async function handleAdd() {
    if (!canAdd || logRpe == null) return;
    setSaving(true);
    try {
      // "Time" is a free-text field in the log form (e.g. "34:20"); we
      // convert it to minutes for the load calc, defaulting sensibly if
      // it doesn't parse.
      const parsedMin = parseTimeToMinutes(logTime) ?? 30;
      await api.logRun({
        runType: logType.trim(),
        distanceMiles: logDist.trim() ? Number(logDist.trim()) || undefined : undefined,
        durationMin: parsedMin,
        rpe: logRpe,
      });
      setLogType("");
      setLogDist("");
      setLogTime("");
      setLogRpe(null);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await api.deleteRun(id);
    refresh();
  }

  return (
    <div className="ath-wrap-runs">
      <div className="runs-header">
        <div>
          <h1 className="page-title" style={{ margin: "0 0 4px" }}>
            My runs
          </h1>
          <p className="page-subtitle" style={{ margin: "0 0 16px" }}>
            Every run, with anything your coach left you.
          </p>
        </div>
      </div>

      <div className="log-run-panel">
        <div className="field-hint">LOG A RUN MANUALLY</div>
        <div className="log-run-grid">
          <input
            className="ath-input"
            value={logType}
            onChange={(e) => setLogType(e.target.value)}
            placeholder="Workout (e.g. Easy 5mi)"
          />
          <input className="ath-input" value={logDist} onChange={(e) => setLogDist(e.target.value)} placeholder="Distance" />
          <input className="ath-input" value={logTime} onChange={(e) => setLogTime(e.target.value)} placeholder="Time" />
        </div>
        <div className="rpe-row">
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="field-hint" style={{ marginBottom: 6 }}>
              How hard did it feel? · <span style={{ color: logRpe ? "#d9703f" : "#7c88a0" }}>{logRpe ? `${logRpe}/10` : "not set yet"}</span>
            </div>
            <div className="rpe-picker">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                <button key={v} className={`rpe-btn ${logRpe === v ? "selected" : ""}`} onClick={() => setLogRpe(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <button className={`add-run-btn ${canAdd ? "enabled" : "disabled"}`} disabled={!canAdd || saving} onClick={handleAdd}>
            Add run
          </button>
        </div>
        {!canAdd && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7c88a0", marginTop: 8 }}>Add a workout name and pick how hard it felt to log the run.</div>}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {runs.map((r) => (
          <div className="run-item" key={r.id}>
            <div className="run-item-row">
              <div className="run-item-date">{formatShortDate(r.date)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="run-item-type">{r.runType}</div>
                <div className="run-item-meta">
                  {r.distanceMiles ? `${r.distanceMiles}mi · ` : ""}
                  {r.durationMin}min · effort {r.rpe}/10
                </div>
              </div>
              <button className="run-item-delete" title="Remove run" onClick={() => handleDelete(r.id)}>
                ×
              </button>
            </div>
          </div>
        ))}
        {runs.length === 0 && <p className="page-subtitle">No runs logged yet.</p>}
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

function parseTimeToMinutes(text: string): number | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const parts = trimmed.split(":").map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] + parts[1] / 60;
  if (parts.length === 1) return parts[0];
  return null;
}

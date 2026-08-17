import { useEffect, useState } from "react";
import { api, type Note, type Run } from "../lib/api";
import { dayLabel, formatDuration, formatShortDate, recentDayOptions, todayKey } from "../lib/format";
import { useAuth } from "../context/AuthContext";
import { ConfirmRunModal } from "../components/ConfirmRunModal";

function clampInt(text: string, min: number, max: number): number {
  const n = Math.round(Number(text) || 0);
  return Math.max(min, Math.min(max, n));
}

// Rounds to 2 decimal places without letting the field hold more.
function roundDistance(text: string): number | undefined {
  const n = Number(text);
  if (!text.trim() || Number.isNaN(n)) return undefined;
  return Math.round(n * 100) / 100;
}

export function AthleteRuns() {
  const { user } = useAuth();
  const athleteId = user?.athleteId ?? null;
  const [runs, setRuns] = useState<Run[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [title, setTitle] = useState("");
  const [distance, setDistance] = useState("");
  const [hh, setHh] = useState("0");
  const [mm, setMm] = useState("0");
  const [ss, setSs] = useState("0");
  const [rpe, setRpe] = useState<number | null>(null);
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [confirming, setConfirming] = useState(false);
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

  const durationMin = Number(hh) * 60 + Number(mm) + Number(ss) / 60;
  const canAdd = title.trim().length > 0 && rpe != null && durationMin > 0;

  async function handleConfirm() {
    if (!canAdd || rpe == null) return;
    setSaving(true);
    try {
      // Always pass `day` explicitly, even for "today" -- see the matching
      // comment in AthleteCheckin.tsx's handleSubmit for why omitting it
      // (and letting the backend fall back to its own UTC "now") is the
      // actual bug this fixes.
      await api.logRun({
        runType: title.trim(),
        distanceMiles: roundDistance(distance),
        durationMin,
        rpe,
        day: selectedDay,
      });
      setTitle("");
      setDistance("");
      setHh("0");
      setMm("0");
      setSs("0");
      setRpe(null);
      setSelectedDay(todayKey());
      setConfirming(false);
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
            Every run, with anything your coach left you. Log as many as you need in a day — split
            workouts and two-a-days are fine.
          </p>
        </div>
      </div>

      <div className="log-run-panel">
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="field-hint">LOG A RUN MANUALLY</div>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span className="field-hint" style={{ color: "var(--text-dim-2)", margin: 0 }}>
              FOR
            </span>
            <select className="ath-input" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
              {recentDayOptions().map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field-hint" style={{ display: "block", marginTop: 10, marginBottom: 4, color: "var(--text-dim-2)" }}>
          Title
        </label>
        <input
          className="ath-input"
          style={{ width: "100%", marginBottom: 10 }}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Easy 5mi, Tempo intervals"
        />

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="field-hint" style={{ color: "var(--text-dim-2)" }}>
              Distance (miles)
            </span>
            <input
              className="ath-input"
              style={{ width: 130 }}
              type="number"
              step="0.01"
              min="0"
              max="200"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
              placeholder="0.00"
            />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="field-hint" style={{ color: "var(--text-dim-2)" }}>
              Duration (hh:mm:ss)
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <input
                className="ath-input"
                style={{ width: 52, textAlign: "center" }}
                type="number"
                min={0}
                max={23}
                value={hh}
                onChange={(e) => setHh(String(clampInt(e.target.value, 0, 23)))}
              />
              <span style={{ color: "var(--text-dim)" }}>:</span>
              <input
                className="ath-input"
                style={{ width: 52, textAlign: "center" }}
                type="number"
                min={0}
                max={59}
                value={mm}
                onChange={(e) => setMm(String(clampInt(e.target.value, 0, 59)))}
              />
              <span style={{ color: "var(--text-dim)" }}>:</span>
              <input
                className="ath-input"
                style={{ width: 52, textAlign: "center" }}
                type="number"
                min={0}
                max={59}
                value={ss}
                onChange={(e) => setSs(String(clampInt(e.target.value, 0, 59)))}
              />
            </div>
          </label>
        </div>

        <div className="rpe-row" style={{ marginTop: 14 }}>
          <div style={{ flex: 1, minWidth: 240 }}>
            <div className="field-hint" style={{ marginBottom: 6 }}>
              How hard did it feel? · <span style={{ color: rpe ? "#d9703f" : "#7c88a0" }}>{rpe ? `${rpe}/10` : "not set yet"}</span>
            </div>
            <div className="rpe-picker">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                <button key={v} className={`rpe-btn ${rpe === v ? "selected" : ""}`} onClick={() => setRpe(v)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <button className={`add-run-btn ${canAdd ? "enabled" : "disabled"}`} disabled={!canAdd} onClick={() => setConfirming(true)}>
            Add run
          </button>
        </div>
        {!canAdd && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7c88a0", marginTop: 8 }}>
            Add a title, a duration, and pick how hard it felt to log the run.
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {runs.map((r) => (
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

      {confirming && (
        <ConfirmRunModal
          title={title.trim()}
          distanceMiles={roundDistance(distance)}
          durationMin={durationMin}
          rpe={rpe ?? 0}
          dayLabel={dayLabel(selectedDay)}
          saving={saving}
          onCancel={() => setConfirming(false)}
          onConfirm={handleConfirm}
        />
      )}
    </div>
  );
}

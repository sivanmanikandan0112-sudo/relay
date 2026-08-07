import { useEffect, useState } from "react";
import { api, type Run } from "../lib/api";

interface AthleteRunsProps {
  athleteId: string;
}

const RUN_TYPES = ["Easy", "Tempo", "Long run", "Race", "Recovery"];

export function AthleteRuns({ athleteId }: AthleteRunsProps) {
  const [runs, setRuns] = useState<Run[]>([]);
  const [runType, setRunType] = useState(RUN_TYPES[0]);
  const [distanceMiles, setDistanceMiles] = useState<number | "">("");
  const [durationMin, setDurationMin] = useState(30);
  const [rpe, setRpe] = useState(5);
  const [saving, setSaving] = useState(false);

  function refresh() {
    api.runsForAthlete(athleteId).then(setRuns);
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  async function handleLog() {
    setSaving(true);
    try {
      await api.logRun({
        athleteId,
        runType,
        distanceMiles: distanceMiles === "" ? undefined : Number(distanceMiles),
        durationMin,
        rpe,
      });
      setDistanceMiles("");
      setDurationMin(30);
      setRpe(5);
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
    <>
      <div className="panel">
        <h2>Log a run</h2>
        <label className="field">
          Type
          <select className="athlete-picker" value={runType} onChange={(e) => setRunType(e.target.value)}>
            {RUN_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Distance (miles, optional)
          <input
            type="number"
            min={0}
            step={0.1}
            value={distanceMiles}
            onChange={(e) => setDistanceMiles(e.target.value === "" ? "" : Number(e.target.value))}
            className="athlete-picker"
          />
        </label>
        <label className="field">
          Duration: <strong>{durationMin} min</strong>
          <input type="range" min={5} max={150} step={5} value={durationMin} onChange={(e) => setDurationMin(Number(e.target.value))} />
        </label>
        <label className="field">
          Effort (RPE): <strong>{rpe}/10</strong>
          <input type="range" min={1} max={10} step={1} value={rpe} onChange={(e) => setRpe(Number(e.target.value))} />
        </label>
        <button className="btn-primary" disabled={saving} onClick={handleLog}>
          {saving ? "Saving…" : "Log run"}
        </button>
      </div>

      <div className="panel">
        <h2>Recent runs</h2>
        {runs.length === 0 && <p className="subtitle">No runs logged yet.</p>}
        <ul className="run-list">
          {runs.map((r) => (
            <li key={r.id}>
              <div className="run-row">
                <span className="run-type">
                  {r.runType}
                  {r.distanceMiles ? ` · ${r.distanceMiles}mi` : ""}
                </span>
                <span className="run-meta">{new Date(r.date).toLocaleDateString()}</span>
              </div>
              <div className="run-row" style={{ marginTop: 4 }}>
                <span className="run-meta">
                  {r.durationMin} min · RPE {r.rpe} · load {r.load}
                </span>
                <button className="btn-secondary" onClick={() => handleDelete(r.id)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}

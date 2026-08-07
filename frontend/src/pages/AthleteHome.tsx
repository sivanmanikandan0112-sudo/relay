import { useEffect, useState } from "react";
import { api, type Athlete, type Note, type ReadinessScoreRecord, type Squad } from "../lib/api";
import { STATUS_LABEL, STATUS_COLOR, statusClass } from "../lib/status";
import { Sparkline } from "../components/Sparkline";
import { SquadSelector } from "../components/SquadSelector";

interface AthleteHomeProps {
  squads: Squad[];
  squadId: string | null;
  onSquadChange: (squadId: string) => void;
}

const RATING_LABELS = ["", "Very low", "Low", "Okay", "Good", "Great"];

export function AthleteHome({ squads, squadId, onSquadChange }: AthleteHomeProps) {
  const [roster, setRoster] = useState<Athlete[]>([]);
  const [athleteId, setAthleteId] = useState<string>("");
  const [history, setHistory] = useState<ReadinessScoreRecord[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [sleepHours, setSleepHours] = useState(8);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [soreness, setSoreness] = useState(3);
  const [stress, setStress] = useState(3);
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!squadId) return;
    api.athletesInSquad(squadId).then((athletes) => {
      setRoster(athletes);
      setAthleteId(athletes[0]?.id ?? "");
    });
  }, [squadId]);

  useEffect(() => {
    if (!athleteId) return;
    setSubmitted(false);
    api.readinessHistory(athleteId).then(setHistory);
    api.notesForAthlete(athleteId).then(setNotes);
  }, [athleteId]);

  const latest = history[history.length - 1];
  const selectedAthlete = roster.find((a) => a.id === athleteId);

  async function handleCheckIn() {
    if (!athleteId) return;
    setSaving(true);
    try {
      await api.submitWellness({ athleteId, sleepHours, mood, energy, soreness, stress });
      setSubmitted(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <p className="eyebrow">Previewing as</p>
      <div className="athlete-picker-row">
        <SquadSelector squads={squads} activeSquadId={squadId} onChange={onSquadChange} />
        <select className="athlete-picker" value={athleteId} onChange={(e) => setAthleteId(e.target.value)}>
          {roster.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <h1>Your week{selectedAthlete ? `, ${selectedAthlete.name.split(" ")[0]}` : ""}.</h1>

      {latest && (
        <article className={`brief-card athlete-score-card ${statusClass(latest.status)}`}>
          <div className="brief-body">
            <div className="brief-header">
              <h3>Readiness</h3>
              <span
                className="badge"
                style={{ borderColor: STATUS_COLOR[latest.status], color: STATUS_COLOR[latest.status] }}
              >
                {STATUS_LABEL[latest.status]}
              </span>
            </div>
            <p>{latest.summary}</p>
          </div>
          <div className="brief-score">
            <Sparkline values={history.map((h) => h.score)} colorVar={STATUS_COLOR[latest.status]} width={100} />
            <div className="score-value" style={{ color: STATUS_COLOR[latest.status] }}>
              {latest.score}
            </div>
            <div className="score-label">ready</div>
          </div>
        </article>
      )}

      <div className="athlete-panels">
        <div className="panel">
          <h2>How are you feeling today?</h2>
          <label className="field">
            Sleep last night: <strong>{sleepHours}h</strong>
            <input type="range" min={0} max={12} step={0.5} value={sleepHours} onChange={(e) => setSleepHours(Number(e.target.value))} />
          </label>
          {[
            { label: "Mood", value: mood, set: setMood },
            { label: "Energy", value: energy, set: setEnergy },
            { label: "Soreness", value: soreness, set: setSoreness },
            { label: "Stress", value: stress, set: setStress },
          ].map((field) => (
            <label className="field" key={field.label}>
              {field.label}: <strong>{RATING_LABELS[field.value]}</strong>
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={field.value}
                onChange={(e) => field.set(Number(e.target.value))}
              />
            </label>
          ))}
          <button className="btn-primary" disabled={saving} onClick={handleCheckIn}>
            {saving ? "Saving…" : "Submit check-in"}
          </button>
          {submitted && <p className="success">Check-in logged. Nice work.</p>}
        </div>

        <div className="panel">
          <h2>Notes from your coach</h2>
          {notes.length === 0 && <p className="subtitle">No notes yet.</p>}
          <ul className="note-list">
            {notes.map((n) => (
              <li key={n.id}>
                <p>{n.body}</p>
                <span className="note-meta">
                  {n.coach.name} · {new Date(n.createdAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

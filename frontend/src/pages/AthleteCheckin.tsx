import { useEffect, useState } from "react";
import { api, type Note, type ReadinessScoreRecord } from "../lib/api";
import { STATUS_LABEL, STATUS_COLOR, statusClass, scoreIsMeaningful } from "../lib/status";
import { Sparkline } from "../components/Sparkline";

interface AthleteCheckinProps {
  athleteId: string;
  athleteName: string;
}

const RATING_LABELS = ["", "Very low", "Low", "Okay", "Good", "Great"];

export function AthleteCheckin({ athleteId, athleteName }: AthleteCheckinProps) {
  const [history, setHistory] = useState<ReadinessScoreRecord[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);

  const [sleep, setSleep] = useState(3);
  const [soreness, setSoreness] = useState(3);
  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [motivation, setMotivation] = useState(3);
  const [msg, setMsg] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  function refresh() {
    api.readinessHistory(athleteId).then(setHistory);
    api.notesForAthlete(athleteId).then(setNotes);
  }

  useEffect(() => {
    setSubmitted(false);
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [athleteId]);

  const latest = history[history.length - 1];

  async function handleCheckIn() {
    setSaving(true);
    try {
      await api.submitWellness({ athleteId, sleep, soreness, mood, energy, motivation, msg: msg || undefined });
      setSubmitted(true);
      setMsg("");
      refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
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
              {scoreIsMeaningful(latest.status) ? latest.score : "—"}
            </div>
            <div className="score-label">ready</div>
          </div>
        </article>
      )}

      <div className="panel">
        <h2>How are you feeling today?</h2>
        {[
          { label: "Sleep", value: sleep, set: setSleep },
          { label: "Soreness", value: soreness, set: setSoreness },
          { label: "Mood", value: mood, set: setMood },
          { label: "Energy", value: energy, set: setEnergy },
          { label: "Motivation", value: motivation, set: setMotivation },
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
        <label className="field">
          Anything your coach should know? (optional)
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. Shins a little sore after the tempo." />
        </label>
        <button className="btn-primary" disabled={saving} onClick={handleCheckIn}>
          {saving ? "Saving…" : "Submit check-in"}
        </button>
        {submitted && <p className="success">Check-in logged. Nice work{athleteName ? `, ${athleteName.split(" ")[0]}` : ""}.</p>}
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
    </>
  );
}

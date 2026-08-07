import { useEffect, useState } from "react";
import { api, type ReadinessScore } from "../lib/api";

const STATUS_LABEL: Record<ReadinessScore["status"], string> = {
  BACK_OFF: "Back off",
  EASE_BACK: "Ease back",
  READY: "Ready",
};

export function Brief() {
  const [scores, setScores] = useState<ReadinessScore[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .brief(31, 2026)
      .then(setScores)
      .catch((e) => setError(e.message));
  }, []);

  const flagged = scores.filter((s) => s.status !== "READY");

  return (
    <section>
      <p className="eyebrow">Monday Brief · Week 31</p>
      <h1>Talk to these {flagged.length} this week.</h1>
      <p className="subtitle">
        Relay read every athlete's trend, wellness and load, and turned it into a decision — not a
        dashboard. Start at the top. The rest of the squad is steady.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="brief-list">
        {scores.map((s, i) => (
          <article key={s.id} className={`brief-card status-${s.status.toLowerCase()}`}>
            <div className="brief-rank">{i + 1}</div>
            <div className="brief-body">
              <div className="brief-header">
                <h3>{s.athlete.name}</h3>
                <span className="badge">{STATUS_LABEL[s.status]}</span>
              </div>
              <p>{s.summary}</p>
              <div className="brief-actions">
                <button className="btn-primary">Leave a note</button>
                <button className="btn-secondary">See the why</button>
              </div>
            </div>
            <div className="brief-score">
              <div className="score-value">{s.score}</div>
              <div className="score-label">ready</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

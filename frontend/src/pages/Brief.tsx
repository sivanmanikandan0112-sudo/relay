import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type ReadinessScore, type Squad } from "../lib/api";
import { STATUS_LABEL, STATUS_COLOR, statusClass } from "../lib/status";
import { Sparkline } from "../components/Sparkline";

const SQUAD_LABEL: Record<Squad["name"], string> = { GIRLS: "Girls", BOYS: "Boys" };

function currentIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function Brief() {
  const { squadId } = useOutletContext<{ squadId: string | null }>();
  const [scores, setScores] = useState<ReadinessScore[]>([]);
  const [squadName, setSquadName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const week = currentIsoWeek(new Date());
  const year = new Date().getFullYear();

  useEffect(() => {
    if (!squadId) return;
    api
      .brief(week, year, squadId)
      .then(setScores)
      .catch((e) => setError(e.message));
    api.squads().then((squads) => {
      const squad = squads.find((s) => s.id === squadId);
      if (squad) setSquadName(SQUAD_LABEL[squad.name]);
    });
  }, [squadId, week, year]);

  // Only athletes actually worth a check-in — injured/return-protocol
  // athletes are expected to look "off" and steady ones need no action.
  const flagged = scores.filter((s) => s.status === "BACK_OFF" || s.status === "EASE_BACK");
  const briefList = flagged.slice(0, 4);

  return (
    <section>
      <p className="eyebrow">
        MONDAY BRIEF · WEEK {week} · {squadName}
      </p>
      <h1>Talk to these {briefList.length} this week.</h1>
      <p className="subtitle">
        Relay read every athlete's trend, wellness and load, and turned it into a decision — not a
        dashboard. Start at the top. The rest of the squad is steady.
      </p>

      {error && <p className="error">{error}</p>}

      <div className="brief-list">
        {briefList.map((s, i) => (
          <article key={s.id} className={`brief-card ${statusClass(s.status)}`}>
            <div className="brief-rank" style={{ background: STATUS_COLOR[s.status] }}>
              {i + 1}
            </div>
            <div className="brief-body">
              <div className="brief-header">
                <h3>{s.athlete.name}</h3>
                <span className="badge" style={{ borderColor: STATUS_COLOR[s.status], color: STATUS_COLOR[s.status] }}>
                  {STATUS_LABEL[s.status]}
                </span>
              </div>
              <p>{s.summary}</p>
              <div className="brief-actions">
                <button className="btn-primary">Leave a note</button>
                <button className="btn-secondary">See the why</button>
              </div>
            </div>
            <div className="brief-score">
              <Sparkline values={s.athlete.readinessScores.map((r) => r.score)} colorVar={STATUS_COLOR[s.status]} />
              <div className="score-value" style={{ color: STATUS_COLOR[s.status] }}>
                {s.score}
              </div>
              <div className="score-label">ready</div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

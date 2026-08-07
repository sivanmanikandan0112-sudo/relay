import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type ReadinessScore } from "../lib/api";
import { STATUS_LABEL, STATUS_COLOR } from "../lib/status";
import { Sparkline } from "../components/Sparkline";

function currentIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function Dashboard() {
  const { squadId } = useOutletContext<{ squadId: string | null }>();
  const [scores, setScores] = useState<ReadinessScore[]>([]);

  useEffect(() => {
    if (!squadId) return;
    const now = new Date();
    api.brief(currentIsoWeek(now), now.getFullYear(), squadId).then(setScores).catch(() => {});
  }, [squadId]);

  return (
    <section>
      <p className="eyebrow">Squad overview</p>
      <h1>Dashboard</h1>
      <table className="table">
        <thead>
          <tr>
            <th>Athlete</th>
            <th>Trend</th>
            <th>Readiness</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => (
            <tr key={s.id}>
              <td>{s.athlete.name}</td>
              <td>
                <Sparkline values={s.athlete.readinessScores.map((r) => r.score)} colorVar={STATUS_COLOR[s.status]} />
              </td>
              <td style={{ color: STATUS_COLOR[s.status], fontFamily: "var(--font-mono)" }}>{s.score}</td>
              <td>{STATUS_LABEL[s.status]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

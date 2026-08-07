import { useEffect, useState } from "react";
import { api, type ReadinessScore } from "../lib/api";

export function Dashboard() {
  const [scores, setScores] = useState<ReadinessScore[]>([]);

  useEffect(() => {
    api.brief(31, 2026).then(setScores).catch(() => {});
  }, []);

  return (
    <section>
      <p className="eyebrow">Squad overview</p>
      <h1>Dashboard</h1>
      <table className="table">
        <thead>
          <tr>
            <th>Athlete</th>
            <th>Readiness</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {scores.map((s) => (
            <tr key={s.id}>
              <td>{s.athlete.name}</td>
              <td>{s.score}</td>
              <td>{s.status.replace("_", " ")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

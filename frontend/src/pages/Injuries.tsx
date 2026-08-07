import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type Injury } from "../lib/api";

export function Injuries() {
  const { squadId } = useOutletContext<{ squadId: string | null }>();
  const [injuries, setInjuries] = useState<Injury[]>([]);

  useEffect(() => {
    if (!squadId) return;
    api.injuries(squadId).then(setInjuries).catch(() => {});
  }, [squadId]);

  return (
    <section>
      <p className="eyebrow">Squad health</p>
      <h1>Injuries</h1>
      {injuries.length === 0 && <p className="subtitle">No injuries on record.</p>}
      <div className="brief-list">
        {injuries.map((injury) => (
          <article key={injury.id} className="brief-card">
            <div className="brief-body">
              <div className="brief-header">
                <h3>{injury.athlete.name}</h3>
                <span className="badge">{injury.status}</span>
              </div>
              <p>{injury.description}</p>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

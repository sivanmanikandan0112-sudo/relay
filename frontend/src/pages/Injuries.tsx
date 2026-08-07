import { useEffect, useState } from "react";
import { api, type Injury } from "../lib/api";

export function Injuries() {
  const [injuries, setInjuries] = useState<Injury[]>([]);

  useEffect(() => {
    api.injuries().then(setInjuries).catch(() => {});
  }, []);

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

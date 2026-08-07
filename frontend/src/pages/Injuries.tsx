import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type Injury } from "../lib/api";

const PILL: Record<Injury["status"], { label: string; color: string }> = {
  ACTIVE: { label: "Out", color: "#7a8291" },
  RECOVERING: { label: "Return protocol", color: "#3d9c9c" },
  RESOLVED: { label: "Cleared", color: "#4ea373" },
};

export function Injuries() {
  const { squadId } = useOutletContext<{ squadId: string | null }>();
  const [injuries, setInjuries] = useState<Injury[]>([]);

  useEffect(() => {
    if (!squadId) return;
    api.injuries(squadId).then(setInjuries).catch(() => {});
  }, [squadId]);

  const active = injuries.filter((i) => i.status !== "RESOLVED");

  return (
    <section>
      <p className="eyebrow">Squad health</p>
      <h1>Injuries</h1>
      <p className="subtitle">
        Return-to-run protocol pauses an athlete's readiness flags so expected-slow rehab paces
        don't get mistaken for a problem.
      </p>
      {active.length === 0 && <p className="subtitle">No injuries on record.</p>}
      <div className="brief-list">
        {active.map((injury) => {
          const pill = PILL[injury.status];
          return (
            <div key={injury.id} className="injury-card">
              <div className="injury-top">
                <div>
                  <div className="injury-name">{injury.athlete.name}</div>
                  <div className="injury-desc">{injury.description}</div>
                </div>
                <span className="injury-pill" style={{ color: pill.color, borderColor: pill.color }}>
                  {pill.label}
                </span>
              </div>
              <div className="injury-meta-row">
                <div>
                  <div className="injury-meta-label">LOGGED</div>
                  <div className="injury-meta-value">{new Date(injury.startDate).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

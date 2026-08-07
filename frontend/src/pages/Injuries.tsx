import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type Injury } from "../lib/api";
import { initials } from "../lib/format";

const PILL: Record<Injury["status"], { label: string; color: string; border: string }> = {
  ACTIVE: { label: "Out", color: "#7a8291", border: "#39414f" },
  RECOVERING: { label: "Protocol", color: "#3d9c9c", border: "#234a4a" },
  RESOLVED: { label: "Cleared", color: "#4ea373", border: "#234a30" },
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
      <h1 className="page-title">INJURIES</h1>
      <p className="page-subtitle" style={{ maxWidth: "64ch" }}>
        Log an injury the day it happens, and switch on return-to-run protocol so expected-slow paces don't
        trip the risk flags.
      </p>

      <div className="injuries-list">
        {active.map((injury) => {
          const isActive = injury.status === "ACTIVE";
          const pill = PILL[injury.status];
          return (
            <div
              key={injury.id}
              className="injury-card"
              style={{
                background: isActive ? "#111925" : "#0e1c1c",
                border: `1px solid ${isActive ? "#1e2839" : "#234a4a"}`,
                borderLeft: `5px solid ${pill.color}`,
              }}
            >
              <div className="injury-top">
                <div className="injury-who">
                  {isActive ? (
                    <div
                      className="injury-avatar"
                      style={{ background: "repeating-linear-gradient(45deg,#5c6478 0 5px,#39414f 5px 10px)" }}
                    />
                  ) : (
                    <div className="injury-avatar" style={{ background: pill.color }}>
                      {initials(injury.athlete.name)}
                    </div>
                  )}
                  <div>
                    <div className="injury-name">{injury.athlete.name}</div>
                    <div className="injury-desc" style={{ color: isActive ? "#8a97ad" : "#7fd8c8" }}>
                      {isActive ? injury.description : `Return-to-run protocol · ${injury.description}`}
                    </div>
                  </div>
                </div>
                <span className="injury-pill" style={{ color: pill.color, borderColor: pill.border }}>
                  {pill.label}
                </span>
              </div>
              {isActive ? (
                <div className="injury-meta-row">
                  <div>
                    <div className="injury-meta-label">LOGGED</div>
                    <div className="injury-meta-value">{new Date(injury.startDate).toLocaleDateString()}</div>
                  </div>
                </div>
              ) : (
                <p className="injury-note">
                  Risk flags are suppressed while on protocol. Slower paces during rehab are expected, not a
                  warning — Relay won't ping you and they won't see an alarming status.
                </p>
              )}
            </div>
          );
        })}
        {active.length === 0 && <p className="page-subtitle">No injuries on record.</p>}
      </div>
    </section>
  );
}

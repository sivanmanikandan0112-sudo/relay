import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type Athlete, type Injury } from "../lib/api";
import { initials } from "../lib/format";
import { InjuryModal } from "../components/InjuryModal";

const PILL: Record<Injury["status"], { label: string; color: string; border: string }> = {
  ACTIVE: { label: "Out", color: "#7a8291", border: "#39414f" },
  RECOVERING: { label: "Protocol", color: "#3d9c9c", border: "#234a4a" },
  RESOLVED: { label: "Cleared", color: "#4ea373", border: "#234a30" },
};

export function Injuries() {
  const { squadId } = useOutletContext<{ squadId: string | null }>();
  const [injuries, setInjuries] = useState<Injury[]>([]);
  const [athletes, setAthletes] = useState<Athlete[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);

  function refresh() {
    if (!squadId) return;
    api
      .injuries(squadId)
      .then(setInjuries)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load injuries"));
  }

  useEffect(refresh, [squadId]);
  useEffect(() => {
    if (!squadId) return;
    api
      .athletesInSquad(squadId)
      .then(setAthletes)
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your roster"));
  }, [squadId]);

  const active = injuries.filter((i) => i.status !== "RESOLVED");
  // Resolved rows still exist in the data (nothing's ever deleted here --
  // same "history stays, only visibility changes" spirit as removing an
  // athlete from the roster) -- they just used to have nowhere to be seen
  // once cleared, which hid real, sometimes-relevant history (recurring
  // injury patterns) with no way to look it up again.
  const resolved = injuries.filter((i) => i.status === "RESOLVED");

  async function updateStatus(id: string, status: Injury["status"]) {
    setUpdatingId(id);
    setError(null);
    try {
      await api.updateInjuryStatus(id, status);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't update that injury");
    } finally {
      setUpdatingId(null);
    }
  }

  return (
    <section>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="page-title">INJURIES</h1>
          <p className="page-subtitle" style={{ maxWidth: "64ch" }}>
            Log an injury the day it happens, and switch on return-to-run protocol so expected-slow paces
            don't trip the risk flags.
          </p>
        </div>
        <button className="btn-primary" disabled={athletes.length === 0} onClick={() => setLogOpen(true)}>
          + Log injury
        </button>
      </div>

      {error && <p className="error">{error}</p>}

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
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                {isActive && (
                  <button
                    className="btn-secondary"
                    disabled={updatingId === injury.id}
                    onClick={() => updateStatus(injury.id, "RECOVERING")}
                  >
                    Start return-to-run protocol
                  </button>
                )}
                <button
                  className="btn-secondary"
                  style={{ color: "#4ea373", borderColor: "#234a30" }}
                  disabled={updatingId === injury.id}
                  onClick={() => updateStatus(injury.id, "RESOLVED")}
                >
                  {updatingId === injury.id ? "Saving…" : "Mark resolved"}
                </button>
              </div>
            </div>
          );
        })}
        {active.length === 0 && <p className="page-subtitle">No injuries on record.</p>}
      </div>

      {resolved.length > 0 && (
        <div className="panel">
          <button
            className="btn-secondary"
            onClick={() => setShowResolved((s) => !s)}
            style={{ marginBottom: showResolved ? 12 : 0 }}
          >
            {showResolved ? "Hide" : "Show"} resolved injuries ({resolved.length})
          </button>
          {showResolved && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {resolved.map((injury) => (
                <div key={injury.id} className="run-item">
                  <div className="run-item-row">
                    <span className="run-item-type">{injury.athlete.name}</span>
                    <span className="injury-pill" style={{ color: PILL.RESOLVED.color, borderColor: PILL.RESOLVED.border }}>
                      Cleared
                    </span>
                  </div>
                  <div className="run-item-row" style={{ marginTop: 4 }}>
                    <span className="run-item-meta">{injury.description}</span>
                  </div>
                  <div className="run-item-row" style={{ marginTop: 4 }}>
                    <span className="run-item-meta">
                      {new Date(injury.startDate).toLocaleDateString()}
                      {injury.endDate ? ` – ${new Date(injury.endDate).toLocaleDateString()}` : ""}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {logOpen && (
        <InjuryModal
          athletes={athletes}
          onClose={() => setLogOpen(false)}
          onSaved={() => {
            setLogOpen(false);
            refresh();
          }}
        />
      )}
    </section>
  );
}

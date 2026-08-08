import { useState } from "react";
import { api, type Gender } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "NONBINARY", label: "Non-binary" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];

// Blocks the rest of the athlete app until gender is on file. Required at
// login, not just available in a settings page somewhere.
export function GenderGate() {
  const { updateUser } = useAuth();
  const [selected, setSelected] = useState<Gender | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleContinue() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      await api.setGender(selected);
      updateUser({ gender: selected });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card" style={{ width: 360 }}>
        <h1>RELAY</h1>
        <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
          Before you get started, tell us your gender. Relay uses this for your squad and roster
          grouping.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`pill-btn ${selected === opt.value ? "selected" : ""}`}
              style={{ width: "100%", height: 42, textAlign: "left", padding: "0 14px" }}
              onClick={() => setSelected(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        <button className="btn-primary" disabled={!selected || saving} onClick={handleContinue}>
          {saving ? "Saving…" : "Continue"}
        </button>
      </div>
    </div>
  );
}

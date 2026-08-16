import { useState } from "react";
import { api, type Athlete } from "../lib/api";

interface InjuryModalProps {
  // Pre-picked when opened from an athlete's own detail drawer -- no
  // picker shown. Omitted when opened from the Injuries page itself, in
  // which case `athletes` supplies the roster to choose from.
  athleteId?: string;
  athleteName?: string;
  athletes?: Athlete[];
  onClose: () => void;
  onSaved: () => void;
}

export function InjuryModal({ athleteId, athleteName, athletes, onClose, onSaved }: InjuryModalProps) {
  const [selectedId, setSelectedId] = useState(athleteId ?? athletes?.[0]?.id ?? "");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const picking = !athleteId;

  async function save() {
    const text = description.trim();
    if (!selectedId || !text) return;
    setSaving(true);
    setError(null);
    try {
      await api.logInjury(selectedId, text);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't log that injury");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-eyebrow">LOG AN INJURY</div>
        {picking ? (
          <>
            <h3 className="modal-title">Who's hurt?</h3>
            <select
              className="ath-input"
              style={{ marginBottom: 12 }}
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              autoFocus
            >
              {(athletes ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </>
        ) : (
          <>
            <h3 className="modal-title">{athleteName}</h3>
            <div className="modal-sub">logged as of today, status starts at "Out"</div>
          </>
        )}
        <textarea
          className="ath-textarea"
          autoFocus={!picking}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. Right ankle sprain, came up in warmups"
        />
        {error && (
          <p className="error" style={{ marginTop: 8 }}>
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-send" disabled={saving || !selectedId || !description.trim()} onClick={save}>
            {saving ? "Logging…" : "Log injury"}
          </button>
        </div>
      </div>
    </div>
  );
}

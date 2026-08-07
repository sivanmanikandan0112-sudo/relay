import { useState } from "react";
import { api } from "../lib/api";

interface NoteModalProps {
  athleteId: string;
  athleteName: string;
  onClose: () => void;
  onSaved: () => void;
}

export function NoteModal({ athleteId, athleteName, onClose, onSaved }: NoteModalProps) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);

  async function send() {
    const text = draft.trim();
    if (!text) return onClose();
    setSaving(true);
    try {
      await api.addNote(athleteId, text);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-eyebrow">LEAVE A NOTE FOR</div>
        <h3 className="modal-title">{athleteName}</h3>
        <div className="modal-sub">attaches to their profile</div>
        <textarea
          className="ath-textarea"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. Ease off Thursday — legs looked heavy on the video."
        />
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-send" disabled={saving} onClick={send}>
            Send note
          </button>
        </div>
      </div>
    </div>
  );
}

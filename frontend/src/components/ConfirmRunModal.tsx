import { formatDuration } from "../lib/format";

interface ConfirmRunModalProps {
  title: string;
  distanceMiles?: number;
  durationMin: number;
  rpe: number;
  dayLabel: string;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function ConfirmRunModal({ title, distanceMiles, durationMin, rpe, dayLabel, saving, onCancel, onConfirm }: ConfirmRunModalProps) {
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-eyebrow">CONFIRM THIS RUN</div>
        <h3 className="modal-title">{title}</h3>
        <div className="drawer-stats" style={{ marginTop: 6 }}>
          <div className="drawer-stat">
            <div className="label">DISTANCE</div>
            <div className="value">{distanceMiles != null ? `${distanceMiles.toFixed(2)}mi` : "—"}</div>
          </div>
          <div className="drawer-stat">
            <div className="label">DURATION</div>
            <div className="value">{formatDuration(durationMin)}</div>
          </div>
          <div className="drawer-stat">
            <div className="label">EFFORT</div>
            <div className="value">{rpe}/10</div>
          </div>
        </div>
        <p style={{ color: "var(--text-dim)", fontSize: 12.5, marginTop: 14 }}>
          This logs a new run for {dayLabel === "Today" ? "today" : dayLabel} — you can log more than once a
          day if you split a workout.
        </p>
        <div className="modal-actions">
          <button className="btn-cancel" onClick={onCancel} disabled={saving}>
            Edit
          </button>
          <button className="btn-send" onClick={onConfirm} disabled={saving}>
            {saving ? "Saving…" : "Confirm & save"}
          </button>
        </div>
      </div>
    </div>
  );
}

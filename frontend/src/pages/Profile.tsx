import { useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

export function Profile() {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleChangePassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    if (newPassword !== confirm) {
      setError("New passwords don't match");
      return;
    }
    if (newPassword.length < 8) {
      setError("New password must be at least 8 characters");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from your current password");
      return;
    }
    setSaving(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setFeedback("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't change your password");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <p className="eyebrow-mono">ACCOUNT</p>
      <h1 className="page-title">My Profile</h1>
      <p className="page-subtitle">
        {user?.name} · {user?.email} · {user?.role === "COACH" ? "Coach" : "Athlete"}
      </p>

      <div className="panel" style={{ marginTop: 0 }}>
        <h2>Change password</h2>
        <form onSubmit={handleChangePassword}>
          <label>
            Current password
            <input
              className="ath-input"
              style={{ marginTop: 4, marginBottom: 12 }}
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              className="ath-input"
              style={{ marginTop: 4, marginBottom: 12 }}
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <label>
            Confirm new password
            <input
              className="ath-input"
              style={{ marginTop: 4, marginBottom: 12 }}
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          {feedback && <p className="success">{feedback}</p>}
          <button
            className="btn-primary"
            style={{ marginTop: 8 }}
            disabled={saving || !currentPassword || !newPassword || !confirm}
            onClick={handleChangePassword}
          >
            {saving ? "Saving…" : "Change password"}
          </button>
        </form>
      </div>
    </section>
  );
}

import { useEffect, useState, type FormEvent } from "react";
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

  // --- MFA -----------------------------------------------------------
  const [mfaStatus, setMfaStatus] = useState<{ enabled: boolean; backupCodesRemaining: number } | null>(null);
  const [setupData, setSetupData] = useState<{ secret: string; qrCodeDataUrl: string } | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [setupError, setSetupError] = useState<string | null>(null);
  const [setupSubmitting, setSetupSubmitting] = useState(false);
  const [newBackupCodes, setNewBackupCodes] = useState<string[] | null>(null);
  const [savedCodes, setSavedCodes] = useState(false);

  const [disablePassword, setDisablePassword] = useState("");
  const [disableError, setDisableError] = useState<string | null>(null);
  const [disabling, setDisabling] = useState(false);

  function refreshMfaStatus() {
    api.mfaStatus().then(setMfaStatus);
  }

  useEffect(refreshMfaStatus, []);

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

  async function handleStartMfaSetup() {
    setSetupError(null);
    const res = await api.mfaSetup();
    setSetupData(res);
  }

  async function handleConfirmMfaSetup(e: FormEvent) {
    e.preventDefault();
    setSetupError(null);
    setSetupSubmitting(true);
    try {
      const res = await api.mfaVerifySetup(setupCode.trim());
      setNewBackupCodes(res.backupCodes);
      setSetupData(null);
      setSetupCode("");
      refreshMfaStatus();
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : "Invalid code. Try again.");
    } finally {
      setSetupSubmitting(false);
    }
  }

  async function handleDisableMfa(e: FormEvent) {
    e.preventDefault();
    setDisableError(null);
    setDisabling(true);
    try {
      await api.mfaDisable(disablePassword);
      setDisablePassword("");
      refreshMfaStatus();
    } catch (err) {
      setDisableError(err instanceof Error ? err.message : "Couldn't disable two-factor authentication");
    } finally {
      setDisabling(false);
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

      <div className="panel">
        <h2>Two-factor authentication</h2>

        {newBackupCodes ? (
          <div>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
              Two-factor authentication is on. <strong>Save these backup codes somewhere safe</strong> — each works
              once, if you ever lose access to your authenticator app. They won't be shown again.
            </p>
            <div
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 13,
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 6,
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: 9,
                padding: 14,
                margin: "12px 0",
              }}
            >
              {newBackupCodes.map((code) => (
                <div key={code}>{code}</div>
              ))}
            </div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
              <input type="checkbox" checked={savedCodes} onChange={(e) => setSavedCodes(e.target.checked)} />
              I've saved these codes somewhere safe
            </label>
            <button className="btn-primary" style={{ marginTop: 10 }} disabled={!savedCodes} onClick={() => setNewBackupCodes(null)}>
              Done
            </button>
          </div>
        ) : !mfaStatus ? null : mfaStatus.enabled ? (
          <div>
            <p style={{ color: "#4ea373", fontSize: 13.5 }}>
              ✓ Enabled — {mfaStatus.backupCodesRemaining} of 10 backup codes remaining.
            </p>
            <form onSubmit={handleDisableMfa} style={{ display: "flex", gap: 8, alignItems: "flex-start", marginTop: 8 }}>
              <input
                className="ath-input"
                style={{ flex: 1 }}
                type="password"
                placeholder="Current password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
              <button className="btn-secondary" disabled={disabling || !disablePassword} onClick={handleDisableMfa}>
                {disabling ? "Disabling…" : "Disable 2FA"}
              </button>
            </form>
            {disableError && (
              <p className="error" style={{ marginTop: 8 }}>
                {disableError}
              </p>
            )}
          </div>
        ) : setupData ? (
          <form onSubmit={handleConfirmMfaSetup}>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
              Scan this QR code with Google Authenticator, Authy, or any TOTP app, then enter the 6-digit code it
              shows.
            </p>
            <img src={setupData.qrCodeDataUrl} alt="MFA setup QR code" style={{ display: "block", margin: "12px 0", background: "#fff", padding: 8, borderRadius: 8 }} />
            <p className="drawer-legend" style={{ marginBottom: 12 }}>
              Can't scan? Enter this key manually: <code>{setupData.secret}</code>
            </p>
            <label>
              6-digit code
              <input
                className="ath-input"
                style={{ marginTop: 4, marginBottom: 12, maxWidth: 160 }}
                value={setupCode}
                onChange={(e) => setSetupCode(e.target.value)}
                autoFocus
                required
              />
            </label>
            {setupError && <p className="error">{setupError}</p>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" disabled={setupSubmitting || !setupCode.trim()} onClick={handleConfirmMfaSetup}>
                {setupSubmitting ? "Verifying…" : "Confirm & enable"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setSetupData(null)}>
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
              Not enabled. Turn on two-factor authentication for an extra layer of protection on your account.
            </p>
            {setupError && <p className="error">{setupError}</p>}
            <button className="btn-primary" style={{ marginTop: 8 }} onClick={handleStartMfaSetup}>
              Enable two-factor authentication
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

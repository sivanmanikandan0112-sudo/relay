import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { renderGoogleButton } from "../lib/google";
import { PUSH_CONFIGURED, getExistingSubscription, pushSupported, subscribeToPush, unsubscribeFromPush } from "../lib/push";
import { formatHour } from "../lib/format";

const GOOGLE_CONFIGURED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;
// Mirrors backend's lib/pushReminder.ts DEFAULT_REMINDER_HOUR -- the
// fallback hour once neither an athlete nor any of their coaches has set
// a preference, shown here purely as display copy ("Same as your coach's
// default (4:00 PM)"), never sent back to the server itself (the server
// is the one source of truth for what "no preference set" resolves to).
const DEFAULT_REMINDER_HOUR = 16;
const REMINDER_HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

export function Profile() {
  const { user, updateUser, logout } = useAuth();
  const navigate = useNavigate();

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

  // --- Readiness visibility (athlete-only) ----------------------------
  const [readinessSaving, setReadinessSaving] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  // --- Google sign-in link --------------------------------------------
  const [googleError, setGoogleError] = useState<string | null>(null);
  const [unlinking, setUnlinking] = useState(false);

  // --- Push notifications (athlete-only) -------------------------------
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null); // this device's current subscription, if any -- null until checked
  const [pushChecked, setPushChecked] = useState(false);
  const [pushSaving, setPushSaving] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  // --- Reminder hour (both roles -- athlete's own override, or a
  // coach's default for their roster) -----------------------------------
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

  // --- Your data: export + delete account (both roles) -----------------
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function refreshMfaStatus() {
    api.mfaStatus().then(setMfaStatus);
  }

  useEffect(refreshMfaStatus, []);

  // Reads this device's actual current subscription state from the
  // browser (not from the backend -- the backend only knows what was
  // last POSTed, but the source of truth for "is this device subscribed
  // right now" is the Push API itself, e.g. after the user cleared site
  // data or revoked the permission outside the app).
  useEffect(() => {
    if (user?.role !== "ATHLETE" || !PUSH_CONFIGURED || !pushSupported()) {
      setPushChecked(true);
      return;
    }
    getExistingSubscription()
      .then((sub) => setPushEndpoint(sub?.endpoint ?? null))
      .finally(() => setPushChecked(true));
  }, [user?.role]);

  async function handleTogglePush(enable: boolean) {
    setPushError(null);
    setPushSaving(true);
    try {
      if (enable) {
        const subscription = await subscribeToPush();
        await api.subscribePush(subscription);
        setPushEndpoint(subscription.endpoint);
      } else if (pushEndpoint) {
        await api.unsubscribePush(pushEndpoint);
        await unsubscribeFromPush();
        setPushEndpoint(null);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setPushSaving(false);
    }
  }

  // Only renders a button while not already linked -- a no-op if
  // VITE_GOOGLE_CLIENT_ID isn't set (see lib/google.ts).
  useEffect(() => {
    if (user?.googleLinked) return;
    renderGoogleButton("google-link-btn", "continue_with", async (idToken) => {
      setGoogleError(null);
      try {
        await api.linkGoogle(idToken);
        updateUser({ googleLinked: true });
      } catch (err) {
        setGoogleError(err instanceof Error ? err.message : "Couldn't link that Google account");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.googleLinked]);

  async function handleUnlinkGoogle() {
    setGoogleError(null);
    setUnlinking(true);
    try {
      await api.unlinkGoogle();
      updateUser({ googleLinked: false });
    } catch (err) {
      setGoogleError(err instanceof Error ? err.message : "Couldn't unlink Google");
    } finally {
      setUnlinking(false);
    }
  }

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

  async function handleToggleReadinessSharing(share: boolean) {
    setReadinessError(null);
    setReadinessSaving(true);
    try {
      await api.setReadinessVisibility(share);
      updateUser({ readinessShared: share });
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setReadinessSaving(false);
    }
  }

  async function handleSetReminderHour(raw: string) {
    const hour = raw === "" ? null : Number(raw);
    setReminderError(null);
    setReminderSaving(true);
    try {
      await api.setReminderHour(hour);
      updateUser({ reminderHour: hour });
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setReminderSaving(false);
    }
  }

  async function handleExportData() {
    setExportError(null);
    setExporting(true);
    try {
      const data = await api.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `relay-data-${user?.username ?? "export"}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Couldn't export your data");
    } finally {
      setExporting(false);
    }
  }

  async function handleDeleteAccount() {
    setDeleteError(null);
    setDeleting(true);
    try {
      await api.deleteMyAccount(deletePassword);
      logout();
      navigate("/login", { replace: true });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Couldn't delete your account");
    } finally {
      setDeleting(false);
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
          <label className="pw-field">
            <span className="pw-field-label">Current password</span>
            <input
              className="ath-input"
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
            />
          </label>
          <label className="pw-field">
            <span className="pw-field-label">New password</span>
            <input
              className="ath-input"
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
          </label>
          <label className="pw-field">
            <span className="pw-field-label">Confirm new password</span>
            <input
              className="ath-input"
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

      {(GOOGLE_CONFIGURED || user?.googleLinked) && (
      <div className="panel">
        <h2>Sign in with Google</h2>
        {user?.googleLinked ? (
          <div>
            <p style={{ color: "#4ea373", fontSize: 13.5 }}>✓ Linked — you can sign in with Google instead of your password.</p>
            <button className="btn-secondary" disabled={unlinking} onClick={handleUnlinkGoogle}>
              {unlinking ? "Unlinking…" : "Unlink Google"}
            </button>
          </div>
        ) : (
          <div>
            <p style={{ color: "var(--text-dim)", fontSize: 13.5, marginBottom: 10 }}>
              Link your Google account to sign in without typing your password. This doesn't replace your
              password or change what you can do — it's just a second way in, and only works for the Google
              account matching this profile's email ({user?.email}).
            </p>
            <div id="google-link-btn" />
          </div>
        )}
        {googleError && (
          <p className="error" style={{ marginTop: 8 }}>
            {googleError}
          </p>
        )}
      </div>
      )}

      {user?.role === "ATHLETE" && (
        <div className="panel">
          <h2>See your own readiness score</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
            This stays coach-only by default — deliberately, so today's check-in stays an honest answer, not
            something to manage toward a number. You can turn it on for yourself if you'd rather see it, and turn it
            back off anytime.
          </p>
          <ul style={{ fontSize: 13, color: "var(--text-dim)", paddingLeft: 18, margin: "10px 0", lineHeight: 1.6 }}>
            <li>
              <strong>On:</strong> you'll see the same score your coach does on your check-in page — useful if you'd
              rather understand why they're easing off your training than have it feel out of nowhere.
            </li>
            <li>
              <strong>Off (default):</strong> keeps your check-in honest — nothing to see means nothing to nudge
              toward. Your coach still sees it and will talk to you about it.
            </li>
          </ul>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <input
              type="checkbox"
              checked={user?.readinessShared ?? false}
              disabled={readinessSaving}
              onChange={(e) => handleToggleReadinessSharing(e.target.checked)}
            />
            Show me my own readiness score
          </label>
          {readinessError && (
            <p className="error" style={{ marginTop: 8 }}>
              {readinessError}
            </p>
          )}
        </div>
      )}

      {user?.role === "ATHLETE" && PUSH_CONFIGURED && pushChecked && pushSupported() && (
        <div className="panel">
          <h2>Check-in reminders</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
            Get a notification on this device if you haven't logged today's check-in yet — sent once a day, only on
            days you haven't already checked in. Turn it on separately on every device you want reminded on.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={!!pushEndpoint}
              disabled={pushSaving}
              onChange={(e) => handleTogglePush(e.target.checked)}
            />
            Remind me on this device if I haven't checked in
          </label>
          {pushError && (
            <p className="error" style={{ marginTop: 8 }}>
              {pushError}
            </p>
          )}

          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, flexWrap: "wrap" }}>
              Remind me at
              <select
                className="ath-input"
                style={{ width: "auto" }}
                value={user?.reminderHour ?? ""}
                disabled={reminderSaving}
                onChange={(e) => handleSetReminderHour(e.target.value)}
              >
                <option value="">Whatever your coach has set (currently {formatHour(DEFAULT_REMINDER_HOUR)})</option>
                {REMINDER_HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </label>
            <p style={{ color: "var(--text-dim)", fontSize: 12, marginTop: 6 }}>
              Your own choice always wins over your coach's default — set it here if the standard time doesn't work
              for you.
            </p>
            {reminderError && (
              <p className="error" style={{ marginTop: 8 }}>
                {reminderError}
              </p>
            )}
          </div>
        </div>
      )}

      {user?.role === "COACH" && PUSH_CONFIGURED && (
        <div className="panel">
          <h2>Default reminder time for your team</h2>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
            The hour Relay reminds an athlete to check in, for anyone on your roster who hasn't picked their own time
            from their own Profile. Doesn't send anything to you — this only sets the fallback for your athletes.
          </p>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5, marginTop: 10, flexWrap: "wrap" }}>
            Remind at
            <select
              className="ath-input"
              style={{ width: "auto" }}
              value={user?.reminderHour ?? ""}
              disabled={reminderSaving}
              onChange={(e) => handleSetReminderHour(e.target.value)}
            >
              <option value="">Relay's default ({formatHour(DEFAULT_REMINDER_HOUR)})</option>
              {REMINDER_HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {formatHour(h)}
                </option>
              ))}
            </select>
          </label>
          {reminderError && (
            <p className="error" style={{ marginTop: 8 }}>
              {reminderError}
            </p>
          )}
        </div>
      )}

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

      <div className="panel">
        <h2>Your data</h2>
        <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
          See exactly what Relay collects and why on the{" "}
          <Link to="/data-policy" style={{ color: "var(--text-dim-2)" }}>
            Data &amp; privacy
          </Link>{" "}
          page.
        </p>

        <div style={{ marginTop: 12 }}>
          <button className="btn-secondary" disabled={exporting} onClick={handleExportData}>
            {exporting ? "Preparing…" : "Download my data"}
          </button>
          {exportError && (
            <p className="error" style={{ marginTop: 8 }}>
              {exportError}
            </p>
          )}
        </div>

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
          {!deleteConfirming ? (
            <button
              className="btn-secondary"
              style={{ color: "var(--red)", borderColor: "var(--red)" }}
              onClick={() => setDeleteConfirming(true)}
            >
              Delete my account
            </button>
          ) : (
            <div style={{ borderLeft: "3px solid var(--red)", paddingLeft: 12 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-dim)", lineHeight: 1.5 }}>
                This permanently scrubs your name, username, email, and any linked sign-in method —
                your account can never be logged into again.{" "}
                {user?.role === "ATHLETE"
                  ? "Your check-in, run, and readiness history stays on file (so your coach's season-long picture isn't torn a hole in) but is no longer tied to your identity, and you're removed from your coach's roster immediately."
                  : "Any notes you've written stay attached to your athletes' records, but no longer show your name."}{" "}
                This can't be undone.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <input
                  className="ath-input"
                  style={{ flex: 1, minWidth: 180 }}
                  type="password"
                  placeholder="Current password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
                <button
                  className="btn-primary"
                  style={{ background: "var(--red)" }}
                  disabled={deleting || !deletePassword}
                  onClick={handleDeleteAccount}
                >
                  {deleting ? "Deleting…" : "Yes, permanently delete my account"}
                </button>
                <button
                  className="btn-secondary"
                  disabled={deleting}
                  onClick={() => {
                    setDeleteConfirming(false);
                    setDeletePassword("");
                    setDeleteError(null);
                  }}
                >
                  Cancel
                </button>
              </div>
              {deleteError && (
                <p className="error" style={{ marginTop: 8 }}>
                  {deleteError}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

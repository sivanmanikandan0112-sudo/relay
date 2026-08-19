import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api, type AdminUserDetail as AdminUserDetailData } from "../../lib/api";

const SQUAD_LABEL: Record<string, string> = { GIRLS: "Girls", BOYS: "Boys" };

export function AdminUserDetail() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<AdminUserDetailData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetFeedback, setResetFeedback] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);

  const [confirmMfaReset, setConfirmMfaReset] = useState(false);
  const [mfaResetFeedback, setMfaResetFeedback] = useState<string | null>(null);
  const [mfaResetting, setMfaResetting] = useState(false);

  function refresh() {
    if (!id) return;
    api
      .adminUserDetail(id)
      .then(setUser)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Couldn't load that user"));
  }

  useEffect(refresh, [id]);

  async function handleResetPassword() {
    if (!id) return;
    if (!confirmReset) {
      setConfirmReset(true);
      return;
    }
    setResetting(true);
    setResetFeedback(null);
    try {
      const res = await api.adminResetUserPassword(id);
      setResetFeedback(
        res.devResetToken
          ? `No email provider configured — dev reset link: ${window.location.origin}/reset-password?token=${res.devResetToken}`
          : "Reset email sent."
      );
    } catch (err) {
      setResetFeedback(err instanceof Error ? err.message : "Couldn't send a reset email");
    } finally {
      setResetting(false);
      setConfirmReset(false);
    }
  }

  async function handleResetMfa() {
    if (!id) return;
    if (!confirmMfaReset) {
      setConfirmMfaReset(true);
      return;
    }
    setMfaResetting(true);
    setMfaResetFeedback(null);
    try {
      await api.adminResetUserMfa(id);
      setMfaResetFeedback("Two-factor authentication reset.");
      refresh();
    } catch (err) {
      setMfaResetFeedback(err instanceof Error ? err.message : "Couldn't reset two-factor authentication");
    } finally {
      setMfaResetting(false);
      setConfirmMfaReset(false);
    }
  }

  if (loadError) {
    return (
      <section>
        <p className="error">{loadError}</p>
        <Link to="/admin/users">Back to users</Link>
      </section>
    );
  }
  if (!user) return null;

  return (
    <section>
      <p className="eyebrow-mono">ADMIN · {user.role === "COACH" ? "COACH" : "ATHLETE"}</p>
      <h1 className="page-title">{user.name}</h1>
      <p className="page-subtitle">
        {user.email} · @{user.username}
        {user.role === "COACH"
          ? user.schoolName
            ? ` · at ${user.schoolName}`
            : " · solo coach, no school"
          : user.squadName
            ? ` · ${SQUAD_LABEL[user.squadName] ?? user.squadName} squad`
            : ""}
        {user.isSuperAdmin ? " · super admin" : ""}
        {user.mfaEnabled ? " · 2FA on" : " · 2FA off"}
      </p>

      {user.role === "COACH" ? (
        <div className="panel" style={{ marginTop: 0 }}>
          <h2>Visible athletes ({user.athletes?.length ?? 0})</h2>
          {(user.athletes?.length ?? 0) === 0 && <p className="page-subtitle">No athletes visible to this coach yet.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {user.athletes?.map((a) => (
              <div key={a.id} className="run-item">
                <div className="run-item-row">
                  <span className="run-item-type">{a.name}</span>
                  <span className="run-item-meta">{SQUAD_LABEL[a.squadName] ?? a.squadName}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="panel" style={{ marginTop: 0 }}>
          <h2>Coaches ({user.coaches?.length ?? 0})</h2>
          {(user.coaches?.length ?? 0) === 0 && <p className="page-subtitle">Not on any coach's roster yet.</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {user.coaches?.map((c) => (
              <div key={c.id} className="run-item">
                <span className="run-item-type">{c.name}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h2>Account actions</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn-secondary"
            style={confirmReset ? { color: "#d9a53c", borderColor: "#d9a53c" } : undefined}
            disabled={resetting}
            onClick={handleResetPassword}
          >
            {resetting ? "Sending…" : confirmReset ? "Confirm: send reset email?" : "Send password reset email"}
          </button>
          {user.mfaEnabled && (
            <button
              className="btn-secondary"
              style={confirmMfaReset ? { color: "#cf5236", borderColor: "#cf5236" } : undefined}
              disabled={mfaResetting}
              onClick={handleResetMfa}
            >
              {mfaResetting ? "Resetting…" : confirmMfaReset ? "Confirm: reset their 2FA?" : "Reset 2FA"}
            </button>
          )}
        </div>
        {resetFeedback && (
          <p className={resetFeedback.startsWith("Couldn't") ? "error" : "success"} style={{ marginTop: 10, wordBreak: "break-all" }}>
            {resetFeedback}
          </p>
        )}
        {mfaResetFeedback && (
          <p className={mfaResetFeedback.startsWith("Couldn't") ? "error" : "success"} style={{ marginTop: 10 }}>
            {mfaResetFeedback}
          </p>
        )}
      </div>

      <Link to="/admin/users" style={{ fontSize: 12.5, color: "var(--text-dim)" }}>
        ← Back to users
      </Link>
    </section>
  );
}

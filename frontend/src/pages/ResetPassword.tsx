import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../lib/api";

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [token, setToken] = useState(params.get("token") ?? "");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      await api.resetPassword(token.trim(), newPassword);
      setDone(true);
      setTimeout(() => navigate("/login"), 1800);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>RELAY</h1>
        <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>Choose a new password.</p>
        {done ? (
          <p className="success">Password updated — redirecting to sign in…</p>
        ) : (
          <>
            <label>
              Reset token
              <input value={token} onChange={(e) => setToken(e.target.value)} type="text" required />
            </label>
            <label>
              New password
              <input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} type="password" required />
            </label>
            <label>
              Confirm new password
              <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Saving…" : "Reset password"}
            </button>
          </>
        )}
        <Link to="/login" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          Back to sign in
        </Link>
      </form>
    </div>
  );
}

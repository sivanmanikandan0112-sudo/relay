import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

export function ForgotPassword() {
  const [username, setUsername] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await api.forgotPassword(username.trim());
      setSent(true);
      setDevToken(res.devResetToken ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <h1>RELAY</h1>
        {!sent ? (
          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
              Enter your username and we'll help you reset your password.
            </p>
            <label>
              Username
              <input value={username} onChange={(e) => setUsername(e.target.value)} type="text" autoFocus required />
            </label>
            {error && <p className="error">{error}</p>}
            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? "Sending…" : "Send reset link"}
            </button>
            <Link to="/login" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
              Back to sign in
            </Link>
          </form>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
              If that username exists, a reset link has been sent.
            </p>
            {devToken && (
              <div className="callout" style={{ background: "#0e1c14", border: "1px solid #234a30", margin: 0 }}>
                <h3 style={{ color: "#4ea373" }}>DEV MODE — NO EMAIL PROVIDER CONFIGURED</h3>
                <p style={{ color: "#c9e6d0" }}>
                  This environment can't send real email, so here's the reset link directly:
                </p>
                <Link
                  to={`/reset-password?token=${devToken}`}
                  className="btn-primary"
                  style={{ display: "inline-block", marginTop: 10, textDecoration: "none" }}
                >
                  Continue to reset password
                </Link>
              </div>
            )}
            <Link to="/login" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
              Back to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

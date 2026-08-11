import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function Login() {
  const { login, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Set once /login responds with mfaRequired -- switches the form to
  // the second step instead of navigating away.
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await login(username.trim(), password);
      if ("mfaRequired" in result) {
        setTempToken(result.tempToken);
        return;
      }
      navigate(result.role === "COACH" ? "/brief" : "/checkin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyMfa(e: FormEvent) {
    e.preventDefault();
    if (!tempToken) return;
    setError(null);
    setSubmitting(true);
    try {
      const user = await verifyMfa(tempToken, code.trim());
      navigate(user.role === "COACH" ? "/brief" : "/checkin");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid code");
    } finally {
      setSubmitting(false);
    }
  }

  if (tempToken) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleVerifyMfa}>
          <h1>RELAY</h1>
          <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
            Enter the 6-digit code from your authenticator app, or one of your backup codes.
          </p>
          <label>
            Code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              type="text"
              inputMode="text"
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" type="submit" disabled={submitting || !code.trim()}>
            {submitting ? "Verifying…" : "Verify"}
          </button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setTempToken(null);
              setCode("");
              setError(null);
            }}
          >
            Back to sign in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>RELAY</h1>
        <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>Sign in to your Relay account.</p>
        <label>
          Username
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            type="text"
            autoComplete="username"
            autoFocus
            required
          />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </button>
        <Link to="/forgot-password" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          Forgot password?
        </Link>
      </form>
    </div>
  );
}

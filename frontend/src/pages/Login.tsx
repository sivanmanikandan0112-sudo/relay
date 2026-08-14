import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { renderGoogleButton } from "../lib/google";

const GOOGLE_CONFIGURED = !!import.meta.env.VITE_GOOGLE_CLIENT_ID;

export function Login() {
  const { login, loginWithGoogle, verifyMfa } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Set once /login (or Google sign-in) responds with mfaRequired --
  // switches the form to the second step instead of navigating away.
  const [tempToken, setTempToken] = useState<string | null>(null);
  const [code, setCode] = useState("");

  // Renders Google's own button into #google-signin -- a no-op if
  // VITE_GOOGLE_CLIENT_ID isn't set (see lib/google.ts), so this is safe
  // to always call.
  useEffect(() => {
    renderGoogleButton("google-signin", "signin_with", async (idToken) => {
      setError(null);
      try {
        const result = await loginWithGoogle(idToken);
        if ("mfaRequired" in result) {
          setTempToken(result.tempToken);
          return;
        }
        navigate(result.role === "COACH" ? "/brief" : "/checkin");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Google sign-in failed");
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        {GOOGLE_CONFIGURED && (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "2px 0" }}>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
              <span style={{ fontSize: 11, color: "var(--text-dim)" }}>OR</span>
              <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            </div>
            <div id="google-signin" style={{ display: "flex", justifyContent: "center" }} />
          </>
        )}
        <Link to="/forgot-password" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          Forgot password?
        </Link>
        <Link to="/signup" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          New coach? Create an account
        </Link>
      </form>
    </div>
  );
}

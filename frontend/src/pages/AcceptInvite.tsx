import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type InviteDetails } from "../lib/api";
import { useAuth } from "../context/AuthContext";

const SQUAD_LABEL: Record<string, string> = { GIRLS: "the girls squad", BOYS: "the boys squad" };

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { setSession } = useAuth();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .inviteDetails(token)
      .then(setInvite)
      .catch((err) => setLoadError(err instanceof Error ? err.message : "This invite link isn't valid."));
  }, [token]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      const { token: authToken, user } = await api.acceptInvite(token, {
        username: username.trim(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
      });
      setSession(authToken, user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account");
    } finally {
      setSubmitting(false);
    }
  }

  if (loadError) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>RELAY</h1>
          <p className="error">{loadError}</p>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
            Ask your coach to send a new invite, or sign in if you already have an account.
          </p>
          <Link to="/login" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!invite) {
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>RELAY</h1>
          <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>Checking your invite…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>RELAY</h1>
        <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
          {invite.coachName} invited you ({invite.email}) to join
          {invite.squadName ? ` ${SQUAD_LABEL[invite.squadName]}` : " Relay"}. Set up your account below.
        </p>
        <div style={{ display: "flex", gap: 10 }}>
          <label style={{ flex: 1 }}>
            First name
            <input value={firstName} onChange={(e) => setFirstName(e.target.value)} type="text" autoFocus required />
          </label>
          <label style={{ flex: 1 }}>
            Last name
            <input value={lastName} onChange={(e) => setLastName(e.target.value)} type="text" required />
          </label>
        </div>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} type="text" required />
        </label>
        <label>
          Password
          <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <label>
          Confirm password
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Creating your account…" : "Create account & sign in"}
        </button>
        <Link to="/login" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
          Already have an account? Sign in
        </Link>
      </form>
    </div>
  );
}

import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, type Gender, type InviteDetails } from "../lib/api";
import { useAuth } from "../context/AuthContext";

// Same options/order as GenderGate.tsx and Join.tsx -- an invited
// athlete answers this once, here, instead of hitting the post-login
// gender gate a second time (accepting sets Athlete.gender straight from
// this answer -- see routes/inviteAccept.ts).
const GENDER_OPTIONS: Array<{ value: Gender; label: string }> = [
  { value: "FEMALE", label: "Female" },
  { value: "MALE", label: "Male" },
  { value: "NONBINARY", label: "Non-binary" },
  { value: "PREFER_NOT_TO_SAY", label: "Prefer not to say" },
];

export function AcceptInvite() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, setSession, updateUser } = useAuth();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [gender, setGender] = useState<Gender | null>(null);
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
    if (invite?.type === "ATHLETE" && !gender) {
      setError("Pick a gender to continue");
      return;
    }
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
        ...(gender ? { gender } : {}),
      });
      setSession(authToken, user);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create your account");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAttach() {
    if (!token) return;
    setError(null);
    setSubmitting(true);
    try {
      const { schoolId, schoolName } = await api.attachInvite(token);
      updateUser({ schoolId, schoolName });
      navigate("/school", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't confirm that invite");
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
            Ask whoever invited you to send a new invite, or sign in if you already have an account.
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

  // COACH_TO_SCHOOL where an account already exists: this is a consent
  // step, not a signup -- the account owner must sign in as themself and
  // explicitly confirm, so the invite can't silently reassign someone
  // else's account. See routes/inviteAccept.ts POST /:token/attach.
  if (invite.type === "COACH_TO_SCHOOL" && invite.targetAccountExists) {
    const signedInAsInvitee = user?.role === "COACH" && user.email.toLowerCase() === invite.email.toLowerCase();
    return (
      <div className="login-screen">
        <div className="login-card">
          <h1>RELAY</h1>
          <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
            {invite.coachName} invited <strong>{invite.email}</strong> to join{" "}
            <strong>{invite.schoolName ?? "their school"}</strong> on Relay as a coach. An account already exists
            for that email.
          </p>
          {signedInAsInvitee ? (
            <>
              <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
                You're signed in as {user!.email}. Confirm you want to join {invite.schoolName}?
              </p>
              {error && <p className="error">{error}</p>}
              <button className="btn-primary" onClick={handleAttach} disabled={submitting}>
                {submitting ? "Joining…" : `Confirm & join ${invite.schoolName ?? "school"}`}
              </button>
            </>
          ) : user ? (
            <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
              You're signed in as {user.email}, but this invite was sent to {invite.email}. Log out and sign in as
              that account, then reopen this link to confirm.
            </p>
          ) : (
            <p style={{ color: "var(--text-dim)", fontSize: 13.5 }}>
              Log in as {invite.email}, then reopen this link to confirm.
            </p>
          )}
          <Link to="/login" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }

  const joinLabel = invite.type === "COACH_TO_SCHOOL" ? `join ${invite.schoolName ?? "their school"} as a coach` : "join the team";

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmit}>
        <h1>RELAY</h1>
        <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
          {invite.coachName} invited you ({invite.email}) to {joinLabel}. Set up your account below.
        </p>
        <label>
          First name
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} type="text" autoFocus required />
        </label>
        <label>
          Last name
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} type="text" required />
        </label>
        {invite.type === "ATHLETE" && (
          <div>
            <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 6 }}>Gender</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {GENDER_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  className={`pill-btn ${gender === opt.value ? "selected" : ""}`}
                  style={{ width: "100%", height: 38, textAlign: "left", padding: "0 12px" }}
                  onClick={() => setGender(opt.value)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
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

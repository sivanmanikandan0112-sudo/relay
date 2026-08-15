import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";

// Public, unauthenticated -- the athlete-initiated side of the school
// join-code flow (see routes/schoolJoin.ts). Two steps, deliberately not
// one combined form: step 1 resolves the code to a school *name* and
// asks the visitor to confirm before step 2 asks for any personal
// details, so nobody's typing a name/email/password before they know
// what they're actually requesting to join. Submitting never logs
// anyone in or creates an account -- it creates a pending request a
// coach at that school has to approve first (see schema.prisma's
// comment on SchoolJoinRequest for why).
export function Join() {
  const [code, setCode] = useState("");
  const [schoolName, setSchoolName] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [squad, setSquad] = useState<"GIRLS" | "BOYS">("GIRLS");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleResolveCode(e: FormEvent) {
    e.preventDefault();
    setCodeError(null);
    setResolving(true);
    try {
      const { schoolName } = await api.resolveJoinCode(code.trim());
      setSchoolName(schoolName);
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : "Couldn't find that school");
    } finally {
      setResolving(false);
    }
  }

  async function handleSubmitRequest(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    if (password !== confirm) {
      setSubmitError("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      setSubmitError("Password must be at least 8 characters");
      return;
    }
    setSubmitting(true);
    try {
      await api.submitJoinRequest(code.trim(), {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        username: username.trim(),
        email: email.trim(),
        password,
        squad,
      });
      setSent(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Couldn't send your request");
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="login-screen">
        <div className="login-card" style={{ textAlign: "center" }}>
          <h1>RELAY</h1>
          <p style={{ color: "var(--text)", fontSize: 14.5, lineHeight: 1.6 }}>
            Request sent to <strong>{schoolName}</strong>. A coach there will review it — you'll be able to sign
            in with the username and password you chose once they approve it.
          </p>
          <Link to="/login" className="btn-secondary" style={{ textDecoration: "none", padding: "10px 22px" }}>
            Back to sign in
          </Link>
        </div>
      </div>
    );
  }

  if (!schoolName) {
    return (
      <div className="login-screen">
        <form className="login-card" onSubmit={handleResolveCode}>
          <h1>RELAY</h1>
          <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
            Enter the join code your coach shared with you.
          </p>
          <label>
            School code
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              type="text"
              autoFocus
              autoCapitalize="characters"
              required
            />
          </label>
          {codeError && <p className="error">{codeError}</p>}
          <button className="btn-primary" type="submit" disabled={resolving || !code.trim()}>
            {resolving ? "Checking…" : "Continue"}
          </button>
          <Link to="/login" style={{ fontSize: 12.5, color: "var(--text-dim)", textAlign: "center" }}>
            Already have an account? Sign in
          </Link>
        </form>
      </div>
    );
  }

  return (
    <div className="login-screen">
      <form className="login-card" onSubmit={handleSubmitRequest}>
        <h1>RELAY</h1>
        <p style={{ color: "var(--text)", margin: 0, fontSize: 14.5 }}>
          Request to join <strong>{schoolName}</strong>? Fill this out and your coach will review it.
        </p>
        <label>
          First name
          <input value={firstName} onChange={(e) => setFirstName(e.target.value)} type="text" autoFocus required />
        </label>
        <label>
          Last name
          <input value={lastName} onChange={(e) => setLastName(e.target.value)} type="text" required />
        </label>
        <label>
          Squad
          <select value={squad} onChange={(e) => setSquad(e.target.value as "GIRLS" | "BOYS")}>
            <option value="GIRLS">Girls</option>
            <option value="BOYS">Boys</option>
          </select>
        </label>
        <label>
          Username
          <input value={username} onChange={(e) => setUsername(e.target.value)} type="text" autoComplete="username" required />
        </label>
        <label>
          Email
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
        </label>
        <label>
          Password
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Confirm password
          <input
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
        {submitError && <p className="error">{submitError}</p>}
        <button className="btn-primary" type="submit" disabled={submitting}>
          {submitting ? "Sending…" : "Send request"}
        </button>
        <button
          type="button"
          className="btn-secondary"
          onClick={() => {
            setSchoolName(null);
            setSubmitError(null);
          }}
        >
          Back
        </button>
      </form>
    </div>
  );
}

import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const BEATS = [
  {
    title: "A 10-second check-in",
    body: "Athletes rate how they feel — sleep, energy, mood, motivation, soreness — and log their runs. That's the whole ask on their end.",
  },
  {
    title: "One readiness number, done right",
    body: "Relay compares each athlete to their own normal — not a league table — and flags the drift that signals overtraining, days before it shows up in their times.",
  },
  {
    title: "Monday, you get the Brief",
    body: "A short, ranked list of who actually needs a check-in this week, with a plain-language reason. The rest of the team stays quiet.",
  },
];

// Public, unauthenticated -- the only route that decides what "/" means.
// Logged-in visitors get bounced straight to their app home, same as the
// old HomeRedirect did; logged-out visitors see the real landing page
// instead of being redirected straight to /login the way this app used
// to work (no public-facing page existed before this).
export function Home() {
  const { user } = useAuth();
  if (user) return <Navigate to={user.role === "COACH" ? "/brief" : "/checkin"} replace />;

  return (
    <div className="login-screen" style={{ alignItems: "flex-start", padding: "64px 24px" }}>
      <div style={{ width: "100%", maxWidth: 720, margin: "0 auto" }}>
        <div className="eyebrow-mono" style={{ textAlign: "center" }}>
          OVERREACHING RADAR
        </div>
        <h1
          className="page-title"
          style={{ textAlign: "center", fontSize: 40, margin: "8px 0 12px", letterSpacing: "-0.01em" }}
        >
          RELAY
        </h1>
        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 16, lineHeight: 1.6, maxWidth: "48ch", margin: "0 auto 28px" }}>
          Relay catches overtraining before it becomes an injury — turning a daily check-in and
          logged runs into one honest signal for the coach of a high school track or cross country
          team.
        </p>

        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginBottom: 48, flexWrap: "wrap" }}>
          <Link to="/signup" className="btn-primary" style={{ textDecoration: "none", padding: "10px 22px" }}>
            Get started
          </Link>
          <Link to="/login" className="btn-secondary" style={{ textDecoration: "none", padding: "10px 22px" }}>
            Sign in
          </Link>
        </div>

        <div style={{ display: "grid", gap: 14 }}>
          {BEATS.map((beat) => (
            <div className="panel" style={{ marginTop: 0 }} key={beat.title}>
              <h2 style={{ fontSize: 15, margin: "0 0 4px" }}>{beat.title}</h2>
              <p style={{ color: "var(--text-dim)", fontSize: 13.5, lineHeight: 1.5, margin: 0 }}>{beat.body}</p>
            </div>
          ))}
        </div>

        <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 12, marginTop: 40 }}>
          Athletes join by invite from their coach — <Link to="/login" style={{ color: "var(--text-dim)" }}>already have an account?</Link>
        </p>
      </div>
    </div>
  );
}

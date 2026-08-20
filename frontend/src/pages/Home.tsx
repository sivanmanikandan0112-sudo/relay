import { useEffect } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Footer } from "../components/Footer";

const COACH_POINTS = [
  "Monday, get the Brief — a short, ranked list of who actually needs a check-in this week, with a plain-language reason",
  "Relay compares each athlete to their own normal, not a league table, and flags the drift days before it shows up in their times",
  "Tap a name for the full picture, leave a note, log an injury — return-to-run protocol keeps expected-slow paces from tripping a flag",
];

const ATHLETE_POINTS = [
  "A 10-second daily check-in — sleep, energy, mood, motivation, soreness — plus logging your runs. That's the whole ask",
  "No score, no chart, by default — Relay works quietly in the background, and your coach reaches out if something needs attention",
  "Curious anyway? Opt in from your Profile to see your own readiness number whenever you want",
];

// Public, unauthenticated -- the only route that decides what "/" means.
// Logged-in visitors get bounced straight to their app home, same as the
// old HomeRedirect did; logged-out visitors see the real landing page
// instead of being redirected straight to /login the way this app used
// to work (no public-facing page existed before this).
export function Home() {
  const { user } = useAuth();

  // index.html's static <title> already matches this, but the SPA never
  // resets it between client-side navigations -- landing here *from*
  // Join or Data & Privacy (both set their own) would otherwise leave
  // whichever title one of those set behind. Setting it explicitly on
  // every one of the three indexable pages (see robots.txt) keeps the
  // tab/search-result title accurate regardless of how someone arrived.
  useEffect(() => {
    document.title = "Relay — overreaching radar";
  }, []);

  if (user) return <Navigate to={user.role === "COACH" ? "/brief" : "/checkin"} replace />;

  return (
    <div className="login-screen" style={{ alignItems: "flex-start", padding: "56px 24px" }}>
      <div style={{ width: "100%", maxWidth: 900, margin: "0 auto" }}>
        <div className="home-hero">
          <div className="eyebrow-mono">OVERREACHING RADAR</div>
          <h1
            className="page-title"
            style={{ textAlign: "center", fontSize: 40, margin: "8px 0 12px", letterSpacing: "-0.01em" }}
          >
            RELAY
          </h1>
          <p style={{ textAlign: "center", color: "var(--text-dim)", fontSize: 16, lineHeight: 1.6, maxWidth: "48ch", margin: "0 auto 26px" }}>
            Relay catches overtraining before it becomes an injury — turning a daily check-in and
            logged runs into one honest signal for the coach of a high school track or cross
            country team.
          </p>

          <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <Link to="/join" className="btn-primary" style={{ textDecoration: "none", padding: "10px 22px" }}>
              Get started
            </Link>
            <Link to="/login" className="btn-secondary" style={{ textDecoration: "none", padding: "10px 22px" }}>
              Sign in
            </Link>
          </div>
          <p style={{ textAlign: "center", color: "var(--text-faint)", fontSize: 11.5, marginTop: 10 }}>
            Athlete with a school join code? That's "Get started." Coaches — see below.
          </p>
        </div>

        <p className="home-audience-lede">One app, built differently for each side of the roster.</p>

        <div className="audience-grid">
          <div className="audience-card for-coaches">
            <div className="audience-eyebrow">FOR COACHES</div>
            <h2 className="audience-title">Know who needs you this week</h2>
            <p className="audience-lede">
              You already can't check in with every runner every day. Relay narrows that down to
              the handful who actually need it.
            </p>
            <div className="audience-points">
              {COACH_POINTS.map((point) => (
                <div className="audience-point" key={point}>
                  <span className="mark">→</span>
                  <span className="txt">{point}</span>
                </div>
              ))}
            </div>
            <div className="audience-cta">
              <p className="fine">
                Coach accounts are set up by your Relay admin, not self-serve — reach out to get one
                started.{" "}
                <Link to="/login" style={{ color: "var(--text-faint)", textDecoration: "underline" }}>
                  Already have an account?
                </Link>
              </p>
            </div>
          </div>

          <div className="audience-card for-athletes">
            <div className="audience-eyebrow">FOR ATHLETES</div>
            <h2 className="audience-title">Ten seconds, then just run</h2>
            <p className="audience-lede">
              Your part is quick and private by default — Relay is watching for your coach, not
              grading you.
            </p>
            <div className="audience-points">
              {ATHLETE_POINTS.map((point) => (
                <div className="audience-point" key={point}>
                  <span className="mark">→</span>
                  <span className="txt">{point}</span>
                </div>
              ))}
            </div>
            <div className="audience-cta">
              <Link to="/join" className="btn-primary" style={{ textDecoration: "none", display: "inline-block", padding: "9px 18px" }}>
                Join with your school code
              </Link>
              <p className="fine" style={{ marginTop: 10 }}>
                Your coach has it, or already invited you directly —{" "}
                <Link to="/login" style={{ color: "var(--text-faint)", textDecoration: "underline" }}>
                  already have an account?
                </Link>
              </p>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}

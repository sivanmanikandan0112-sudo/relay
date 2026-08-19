import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Footer } from "../components/Footer";

// Public, unauthenticated -- reachable from the footer on every page,
// logged in or not, plus linked directly from Profile's own "Your data"
// panel. Plain-English description of what this app actually does with
// the data it collects, not a substitute for a lawyer-drafted privacy
// policy or terms of service -- a school/district should have their own
// counsel review this before treating it as their official policy.
export function DataPolicy() {
  const { user } = useAuth();

  return (
    <div className="login-screen" style={{ alignItems: "flex-start", padding: "56px 24px" }}>
      <div style={{ width: "100%", maxWidth: 760, margin: "0 auto" }}>
        {user ? (
          <Link to={user.role === "COACH" ? "/brief" : "/checkin"} style={{ color: "var(--text-faint)", fontSize: 13 }}>
            ← Back to Relay
          </Link>
        ) : (
          <Link to="/" style={{ color: "var(--text-faint)", fontSize: 13 }}>
            ← Back to Relay
          </Link>
        )}

        <div className="eyebrow-mono" style={{ marginTop: 18 }}>
          DATA &amp; PRIVACY
        </div>
        <h1 className="page-title" style={{ margin: "8px 0 6px" }}>
          What Relay collects, and why
        </h1>
        <p className="page-subtitle" style={{ maxWidth: "60ch" }}>
          Written in plain language, describing exactly what this app does today — not legal
          boilerplate. If your school needs a formal privacy policy or data-processing agreement,
          this page is the starting point for that conversation, not a replacement for it.
        </p>

        <div className="panel" style={{ marginTop: 20 }}>
          <h2>What we collect</h2>
          <ul style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7, paddingLeft: 18 }}>
            <li>
              <strong>Account info</strong> — name, username, email, and your role (coach or
              athlete). For an athlete, also which squad and, if you've told us, your gender.
            </li>
            <li>
              <strong>Daily check-ins</strong> — sleep, energy, mood, motivation, and soreness (1–5
              each), plus an optional note to your coach. This is the core signal Relay is built
              around.
            </li>
            <li>
              <strong>Logged runs</strong> — type, distance, duration, and how hard it felt
              (RPE 1–10).
            </li>
            <li>
              <strong>Injuries</strong>, logged by your coach — status and a short description.
            </li>
            <li>
              <strong>Notes</strong> a coach leaves on your profile.
            </li>
            <li>
              <strong>Computed readiness scores</strong> — a number and status Relay derives every
              week from the data above. It's never a separate input; it's math run on what's
              already listed here.
            </li>
            <li>
              <strong>Basic activity</strong> — when you log in, and (only if you turn on
              notifications) a Web Push subscription so your browser or phone can show a reminder.
              A push notification is delivered through your browser vendor's own push service
              (e.g. Google's, on Chrome/Android; Apple's, on Safari/iOS) — standard for how every
              website's notifications work, not something specific to Relay.
            </li>
          </ul>
          <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 10 }}>
            We don't collect location, device contacts, browsing history outside this app, or
            anything from a device's camera or microphone. There's no advertising in Relay and no
            data is sold or shared with advertisers.
          </p>
        </div>

        <div className="panel">
          <h2>Who can see it</h2>
          <ul style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7, paddingLeft: 18 }}>
            <li>An athlete's coach — and, if their school has more than one coach, every coach sharing that roster.</li>
            <li>
              The athlete themself — their own check-in and run history always; their own readiness
              score only if they've turned that on in their Profile (off by default, on purpose —
              see below).
            </li>
            <li>
              A Relay super admin, for account support and troubleshooting — the same handful of
              people who can reset a password or help with a locked-out account, not a general
              audience.
            </li>
            <li>Nobody else. Teammates never see another athlete's check-ins, notes, or readiness score.</li>
          </ul>
        </div>

        <div className="panel">
          <h2>Why readiness scores are hidden from athletes by default</h2>
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
            An athlete who can see their own number has a real incentive to answer the daily
            check-in in whatever way keeps that number up, rather than what's actually true that
            day. Keeping it coach-only by default protects the one thing that makes the whole
            system work: an honest answer. Any athlete can turn it on for themselves anytime from
            their own Profile, and back off again just as easily — a coach can never do this on an
            athlete's behalf.
          </p>
        </div>

        <div className="panel">
          <h2>How long we keep it</h2>
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
            Check-in, run, injury, and readiness history is kept for as long as your account exists
            — a season-over-season record is part of what makes the trend detection useful, so
            nothing is auto-deleted after a fixed window. Removing an athlete from a coach's active
            roster (e.g. graduation) never deletes their history; it only stops new check-ins from
            counting toward that coach's current board. You can permanently end this at any time —
            see below.
          </p>
        </div>

        <div className="panel">
          <h2>Your data, your control</h2>
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.6, marginBottom: 12 }}>
            Two self-service actions, available anytime from{" "}
            <Link to="/profile" style={{ color: "var(--text-dim-2)" }}>
              My Profile
            </Link>{" "}
            — no need to email anyone or wait on a coach or admin:
          </p>
          <ul style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.7, paddingLeft: 18 }}>
            <li>
              <strong>Download your data</strong> — every check-in, run, injury, note, and
              readiness score tied to your account, as one file you can keep or hand to anyone
              you choose.
            </li>
            <li>
              <strong>Delete your account</strong> — your name, username, email, and any linked
              sign-in method are permanently scrubbed and replaced with a placeholder; your account
              can never be logged into again. Your historical check-ins, runs, and readiness data
              stay in the system so your coach's season-long picture isn't torn a hole in — but
              they're no longer tied to your identity, and you're removed from every coach's active
              roster immediately. This can't be undone.
            </li>
          </ul>
        </div>

        <div className="panel">
          <h2>Questions</h2>
          <p style={{ fontSize: 13.5, color: "var(--text-dim)", lineHeight: 1.6 }}>
            Reach out any time — see the footer below.
          </p>
        </div>
      </div>
      <Footer />
    </div>
  );
}

const STEPS = [
  {
    title: "Your athletes check in",
    body: (
      <>
        Each runner spends 10 seconds a day rating how they feel (sleep, energy, mood, motivation,
        soreness) and logs their runs. That's the raw material — you don't chase anyone for data:
        Relay can remind them automatically if a day slips, and they can always go back and fill
        one in for up to a week after.
      </>
    ),
  },
  {
    title: "Relay compares each kid to their own normal",
    body: (
      <>
        Every athlete gets a personal baseline. Relay watches for the drift that signals
        overtraining — effort creeping up for the same pace, feel scores dipping over{" "}
        <em>weeks</em>, not one hard day — and rolls it into one <strong>readiness</strong> number.{" "}
        <span className="dim">
          (The math leans on the signals sports science actually trusts; the load ratio is a flag,
          never the verdict.)
        </span>
      </>
    ),
  },
  {
    title: "Monday, you get the Brief",
    body: (
      <>
        Open <strong>Brief</strong> and Relay hands you a short list: talk to these few this week,
        each with one plain-language reason. The rest of the team is steady, so it stays quiet.
        Need the full picture? The <strong>Dashboard</strong> shows every runner as a lane you can
        scan like a scoreboard.
      </>
    ),
  },
  {
    title: "You act — and it closes the loop",
    body: (
      <>
        Tap a name to see the "why" behind the flag, then leave a note that lands on that
        athlete's profile. If someone's hurt, log it in <strong>Injuries</strong> — return-to-run
        protocol pauses their flags so expected-slow rehab paces don't look like a problem. When
        someone graduates or moves on, remove them from your roster from that same detail view —
        their check-in and run history stays exactly as it is, nothing is lost.
      </>
    ),
  },
];

export function HowItWorksContent() {
  return (
    <div style={{ maxWidth: 820 }}>
      <div className="eyebrow-mono">UNDER THE HOOD</div>
      <h1 className="page-title">How Relay works</h1>
      <p className="page-subtitle">
        Your week in four steps. Relay does the watching so you can spend your time on the runners
        who need it.
      </p>
      <div className="step-list">
        {STEPS.map((step, i) => (
          <div className="step-card" key={step.title}>
            <div className="step-num">{i + 1}</div>
            <div>
              <div className="step-title">{step.title}</div>
              <div className="step-body">{step.body}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="callout" style={{ background: "#0c1017", border: "1px solid #1e2839" }}>
        <h3>Getting athletes onto your roster</h3>
        <p>
          Invite them directly from <strong>Invite</strong> — bulk-add a list of emails, no squad
          guessing required; each athlete picks their own gender when they accept, and that's what
          sorts them onto Girls or Boys. Or share your school's join code (see{" "}
          <strong>School</strong>) and let them request to join themselves — nobody's on your
          roster until you approve their request.
        </p>
        <p style={{ marginTop: 8 }}>
          Part of a school with other coaches? You automatically share one roster — any athlete
          anyone there has ever added shows up for every coach at that school, not just whoever
          sent the original invite.
        </p>
      </div>
      <div className="callout" style={{ background: "#0c1017", border: "1px solid #1e2839" }}>
        <h3>Install Relay as an app</h3>
        <p>
          Add Relay to your phone or tablet's home screen and it opens full-screen, no browser
          bar, exactly like any other app — quicker to reach between reps or on your way out of
          practice.
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>iPhone/iPad:</strong> open relaycoach.app in Safari, tap the Share icon, then{" "}
          <strong>Add to Home Screen</strong>.
        </p>
        <p style={{ marginTop: 8 }}>
          <strong>Android:</strong> open it in Chrome, tap the ⋮ menu, then{" "}
          <strong>Install app</strong> (or <strong>Add to Home Screen</strong>) — Chrome sometimes
          offers this on its own too.
        </p>
      </div>
      <div className="callout" style={{ background: "#0c1017", border: "1px solid #1e2839" }}>
        <h3>What Relay is — and isn't</h3>
        <p>
          It isn't another training log or planner. It's the layer on top that answers one question
          no other tool does: <strong style={{ color: "#c3cddd" }}>who needs my attention this week?</strong>{" "}
          It can sit alongside whatever you already use.
        </p>
      </div>
    </div>
  );
}

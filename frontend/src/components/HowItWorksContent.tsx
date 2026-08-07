const STEPS = [
  {
    title: "Your athletes check in",
    body: (
      <>
        Each runner spends 10 seconds a day rating how they feel (sleep, energy, mood, motivation,
        soreness) and logs their runs. That's the raw material — you don't chase anyone for data.
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
        athlete's runs. If someone's hurt, log it in <strong>Injuries</strong> — return-to-run
        protocol pauses their flags so expected-slow rehab paces don't look like a problem.
      </>
    ),
  },
];

export function HowItWorksContent() {
  return (
    <>
      <p className="eyebrow">UNDER THE HOOD</p>
      <h1>How Relay works</h1>
      <p className="subtitle">
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
      <div className="callout">
        <h3>What Relay is — and isn't</h3>
        <p>
          It isn't another training log or planner. It's the layer on top that answers one question
          no other tool does: <strong>who needs my attention this week?</strong> It can sit
          alongside whatever you already use.
        </p>
      </div>
    </>
  );
}

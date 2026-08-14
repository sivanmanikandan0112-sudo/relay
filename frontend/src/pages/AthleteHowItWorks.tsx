const STEPS = [
  {
    title: "Check in once a day",
    body: "Tap how you're feeling — sleep, energy, mood, motivation, soreness. There's no right answer; honest is what helps. Add a note if something's up.",
  },
  {
    title: "Log your runs",
    body: (
      <>
        Add each run by hand in <strong>My Runs</strong>. That's where you'll also see any notes
        your coach leaves you.
      </>
    ),
  },
  {
    title: "That's it — just run",
    body: (
      <>
        Relay handles the rest quietly in the background. By default you won't see a score or
        chart — if anything ever needs attention, your coach reaches out to you. Curious anyway?
        There's an opt-in to see your own readiness number in your <strong>Profile</strong>.
      </>
    ),
  },
];

const CAN_SEE = [
  "A general sense of how you're trending week to week",
  "Your runs — distance, pace, and how hard it felt (1–10)",
  "Your check-ins and anything you choose to tell them",
];

const PRIVATE = ["Your GPS routes and location", "Your raw heart-rate data", "Anything shared with teammates — nobody else sees your numbers"];

export function AthleteHowItWorks() {
  return (
    <div className="ath-wrap-narrow">
      <div className="eyebrow-mono" style={{ marginBottom: 2 }}>
        WELCOME TO RELAY
      </div>
      <h1 className="page-title">Here's all you have to do.</h1>
      <p className="page-subtitle" style={{ maxWidth: "52ch" }}>
        Relay helps your coach spot when you might be pushing too hard, so they can catch it before it
        becomes an injury. Your part takes about 10 seconds a day.
      </p>
      <div className="step-list">
        {STEPS.map((step, i) => (
          <div className="step-card" key={step.title}>
            <div className="step-num" style={{ width: 32, height: 32, fontSize: 16 }}>
              {i + 1}
            </div>
            <div>
              <div className="step-title">{step.title}</div>
              <div className="step-body">{step.body}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="callout" style={{ background: "#0e1c14", border: "1px solid #234a30" }}>
        <h3 style={{ color: "#4ea373" }}>WHAT YOUR COACH CAN SEE</h3>
        {CAN_SEE.map((line) => (
          <div className="callout-line" key={line}>
            <span style={{ color: "#4ea373" }}>✓</span>
            <span style={{ fontSize: 13.5, color: "#c9e6d0" }}>{line}</span>
          </div>
        ))}
      </div>

      <div className="callout" style={{ background: "#0e1622", border: "1px solid #1e2839" }}>
        <h3 style={{ color: "#8a97ad" }}>WHAT STAYS PRIVATE</h3>
        {PRIVATE.map((line) => (
          <div className="callout-line" key={line}>
            <span style={{ color: "#8a97ad" }}>×</span>
            <span style={{ fontSize: 13.5, color: "#9fabbf" }}>{line}</span>
          </div>
        ))}
      </div>

      <div className="callout" style={{ background: "#0e1c1c", border: "1px solid #234a4a" }}>
        <h3 style={{ color: "#3d9c9c", fontSize: 13 }}>COMING BACK FROM INJURY?</h3>
        <p style={{ color: "#9fabbf" }}>
          Your status shows <span style={{ color: "#7fd8c8" }}>return protocol</span> instead of a flag —
          slower paces are expected, so the app won't alarm you or your coach for running easy.
        </p>
      </div>
    </div>
  );
}

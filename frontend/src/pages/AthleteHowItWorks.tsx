const STEPS = [
  {
    title: "Check in once a day",
    body: (
      <>
        Tap how you're feeling — sleep, energy, mood, motivation, soreness. There's no right
        answer; honest is what helps. Add a note if something's up. Missed a day? You can go back
        and fill one in for up to a week — no need to skip it.
      </>
    ),
  },
  {
    title: "Log your runs",
    body: (
      <>
        Add each run by hand in <strong>My Runs</strong> — same catch-up window if you fall
        behind. That's also where you'll see any notes your coach leaves you.
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
  {
    title: "Turn on reminders (optional)",
    body: (
      <>
        Flip on check-in reminders from your <strong>Profile</strong> and Relay will nudge you on
        this device if a day's check-in goes missing — never a repeat once you've already logged
        it. Add Relay to your home screen first (see below) — on iPhone, that's the only way the
        reminder can actually show up.
      </>
    ),
  },
];

const CAN_SEE = [
  "A general sense of how you're trending week to week",
  "Your runs — distance, pace, and how hard it felt (1–10)",
  "Your check-ins and anything you choose to tell them",
];

const PRIVATE = [
  "Anything shared with teammates — nobody else on the team sees your numbers",
  "Your account & sign-in details — password, two-factor setup, that's all yours",
];

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

      <div className="callout" style={{ background: "#1c1409", border: "1px solid #4a3620" }}>
        <h3 style={{ color: "var(--orange)", fontSize: 13 }}>GET IT ON YOUR HOME SCREEN</h3>
        <p style={{ color: "#9fabbf" }}>
          Add Relay to your home screen and it opens full-screen like a real app, works even with
          no signal, and — on iPhone especially — it's the only way check-in reminders can
          actually show up. A plain browser tab can't display them.
        </p>
        <p style={{ color: "#9fabbf", marginTop: 8 }}>
          <span style={{ color: "#e8a878" }}>iPhone/iPad:</span> open relaycoach.app in Safari, tap
          the Share icon, then <span style={{ color: "#e8a878" }}>Add to Home Screen</span>.
        </p>
        <p style={{ color: "#9fabbf", marginTop: 8 }}>
          <span style={{ color: "#e8a878" }}>Android:</span> open it in Chrome, tap the ⋮ menu,
          then <span style={{ color: "#e8a878" }}>Install app</span> (or{" "}
          <span style={{ color: "#e8a878" }}>Add to Home Screen</span>).
        </p>
        <p style={{ color: "#9fabbf", marginTop: 8 }}>
          Reminders stop showing up after you remove and re-add the icon? That breaks the old
          subscription — just flip reminders off and back on in your Profile to fix it.
        </p>
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

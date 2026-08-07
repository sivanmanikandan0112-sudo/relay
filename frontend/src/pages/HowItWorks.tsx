export function HowItWorks() {
  return (
    <section>
      <p className="eyebrow">Under the hood</p>
      <h1>How it works</h1>
      <p className="subtitle">
        Relay combines each athlete's training load, wellness check-ins and recent trend into a single
        readiness score, then ranks the squad so a coach knows exactly who to talk to first.
      </p>
      <ul className="how-list">
        <li><strong>Back off</strong> — score below 40. Load is outpacing recovery.</li>
        <li><strong>Ease back</strong> — score 40–64. Worth watching, maybe soften the next session.</li>
        <li><strong>Ready</strong> — score 65+. Steady, no action needed.</li>
      </ul>
    </section>
  );
}

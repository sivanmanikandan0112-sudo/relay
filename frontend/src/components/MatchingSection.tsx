import { useMemo, useState } from "react";
import { api, type ReadinessScore } from "../lib/api";
import { STATUS_COLOR } from "../lib/status";

interface MatchingSectionProps {
  scores: ReadinessScore[];
  // Re-fetches the Brief's own `scores` from the server after a talked-to
  // toggle -- same "let the server stay the single source of truth" pattern
  // DetailDrawer's onRemoved already uses on this page, rather than
  // reaching into local state here.
  onRefresh: () => void;
}

const MIN_COUNT = 1;
const MAX_COUNT = 8;
const DEFAULT_COUNT = 3;

// Previously a fake "who's free when" bipartite match against per-athlete
// availability derived from a hash of their name -- looked plausible but
// had no connection to actual risk, and a name could hash into zero
// overlap with the offered time slots, silently bumping the athletes who
// most needed a slot in favor of whoever's fake availability happened to
// line up (see the git history for the exact bug report). Replaced with
// what it always should have been: the N highest-priority runners this
// week, full stop, with a per-athlete checkmark for "I've actually talked
// to them" instead of a fabricated schedule.
export function MatchingSection({ scores, onRefresh }: MatchingSectionProps) {
  const [count, setCount] = useState(DEFAULT_COUNT);
  const [savingId, setSavingId] = useState<string | null>(null);

  // Injured/return-protocol athletes are excluded, same as before -- their
  // status is already known and expected, not something a check-in
  // conversation resolves.
  const ranked = useMemo(
    () =>
      scores
        .filter((s) => s.status !== "INJURED" && s.status !== "RETURN_PROTOCOL")
        .slice()
        .sort((a, b) => a.score - b.score), // lowest score = needs it most, first
    [scores]
  );

  const picks = ranked.slice(0, count);

  async function toggleTalkedTo(s: ReadinessScore) {
    setSavingId(s.id);
    try {
      await api.markTalkedTo(s.id, !s.talkedToAt);
      onRefresh();
    } finally {
      setSavingId(null);
    }
  }

  if (ranked.length === 0) return null;

  return (
    <div className="match-section">
      <div className="match-head">
        <h2>Fit them into your week</h2>
        <div className="match-head-right">
          <button
            className="match-count-btn"
            disabled={count <= MIN_COUNT}
            onClick={() => setCount((c) => Math.max(MIN_COUNT, c - 1))}
            aria-label="Fewer"
          >
            −
          </button>
          <span className="match-count-num">{count}</span>
          <button
            className="match-count-btn"
            disabled={count >= MAX_COUNT || count >= ranked.length}
            onClick={() => setCount((c) => Math.min(MAX_COUNT, c + 1))}
            aria-label="More"
          >
            +
          </button>
        </div>
      </div>
      <p className="match-desc">
        Your {count} highest-priority runner{count === 1 ? "" : "s"} this week, ranked by who needs a
        check-in most. Tap the checkmark once you've actually talked to them.
      </p>
      <div className="match-slots">
        {picks.map((s, i) => {
          const done = !!s.talkedToAt;
          return (
            <div className={`match-slot${done ? " match-slot-done" : ""}`} key={s.id}>
              <span className="match-rank">{i + 1}</span>
              <span className="match-cand-dot" style={{ background: STATUS_COLOR[s.status] }} />
              <span className="match-cand-name">{s.athlete.name}</span>
              <span className="match-cand-score" style={{ color: STATUS_COLOR[s.status] }}>
                {s.score}
              </span>
              <button
                className={`match-check${done ? " match-check-done" : ""}`}
                disabled={savingId === s.id}
                onClick={() => toggleTalkedTo(s)}
                title={done ? "Mark as not talked to yet" : "Mark as talked to"}
              >
                ✓
              </button>
            </div>
          );
        })}
      </div>
      <div className="match-footnote">Injured &amp; return-protocol runners are left out automatically.</div>
    </div>
  );
}

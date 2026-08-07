import { useMemo, useState } from "react";
import type { ReadinessScore } from "../lib/api";
import { deriveAvailability, solveMatching, TIMES, type Candidate, type Slot } from "../lib/matching";

interface MatchingSectionProps {
  scores: ReadinessScore[];
}

const DEFAULT_SLOTS: Slot[] = [
  { id: "sl1", time: "Tue lunch", type: "full" },
  { id: "sl2", time: "Thu AM", type: "full" },
  { id: "sl3", time: "Fri lunch", type: "quick" },
];

export function MatchingSection({ scores }: MatchingSectionProps) {
  const [slotDefs, setSlotDefs] = useState<Slot[]>(DEFAULT_SLOTS);
  const [matchPins, setMatchPins] = useState<Record<string, string>>({});

  const candidates: Candidate[] = useMemo(
    () =>
      scores
        .filter((s) => s.status !== "INJURED" && s.status !== "RETURN_PROTOCOL")
        .map((s) => ({
          id: s.athleteId,
          name: s.athlete.name,
          risk: 100 - s.score, // higher = needs a slot more, mirrors the source's risk scale
          statusColor: "#33415c",
          avail: deriveAvailability(s.athlete.name),
        }))
        .sort((a, b) => b.risk - a.risk),
    [scores]
  );

  const sol = useMemo(() => solveMatching(slotDefs, candidates, matchPins), [slotDefs, candidates, matchPins]);
  const matchCustom = Object.keys(matchPins).length > 0;

  function cycleSlotTime(id: string) {
    setSlotDefs((defs) =>
      defs.map((sl) => (sl.id === id ? { ...sl, time: TIMES[(TIMES.indexOf(sl.time as (typeof TIMES)[number]) + 1) % TIMES.length] } : sl))
    );
  }

  function addSlot() {
    if (slotDefs.length >= 6) return;
    setSlotDefs((defs) => [...defs, { id: `sl${Date.now()}`, time: TIMES[defs.length % TIMES.length], type: "quick" }]);
  }

  function removeSlot(id: string) {
    setSlotDefs((defs) => defs.filter((sl) => sl.id !== id));
    setMatchPins((pins) => {
      const next = { ...pins };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="match-section">
      <div className="match-head">
        <h2>Fit them into your week</h2>
        <div className="match-head-right">
          <span className="match-or-badge">OR · bipartite match</span>
          {matchCustom && (
            <button className="match-reset" onClick={() => setMatchPins({})}>
              reset
            </button>
          )}
        </div>
      </div>
      <p className="match-desc">
        The list above says <em>who</em>. This says <em>when</em>: Relay assigns your open 1:1 slots to
        those runners by who's actually free then — a real slot-to-athlete match, not just the ranking.
        Tap a time to change it.
      </p>
      <div className="match-slots">
        {sol.picks.map((p) => {
          const pinned = !!matchPins[p.slot.id];
          let reason: string;
          if (!p.c) reason = `No athlete free at ${p.slot.time}`;
          else if (pinned) reason = "Pinned by you";
          else reason = `${p.w - p.c.risk > 0 ? "Best fit, " : ""}top risk free at ${p.slot.time}`;

          return (
            <div className="match-slot" key={p.slot.id}>
              <button className="match-time-btn" onClick={() => cycleSlotTime(p.slot.id)}>
                {p.slot.time}
              </button>
              <span className="match-arrow">→</span>
              {p.c ? (
                <>
                  <span className="match-cand-dot" style={{ background: candidateColor(p.c, scores) }} />
                  <span className="match-cand-name">{p.c.name}</span>
                </>
              ) : (
                <span className="match-none">no one free at this time</span>
              )}
              <span className="match-reason">{reason}</span>
              <button className="match-remove" title="remove slot" onClick={() => removeSlot(p.slot.id)}>
                ×
              </button>
            </div>
          );
        })}
        {slotDefs.length < 6 && (
          <button className="match-add-slot" onClick={addSlot}>
            + add a 1:1 slot
          </button>
        )}
      </div>
      <div className="match-footnote">Injured &amp; return-protocol runners are left out of the match automatically.</div>
    </div>
  );
}

function candidateColor(c: Candidate, scores: ReadinessScore[]): string {
  const match = scores.find((s) => s.athleteId === c.id);
  return match ? statusColorFor(match) : "#33415c";
}

function statusColorFor(s: ReadinessScore): string {
  const colors: Record<string, string> = {
    FRESH: "#4ea373",
    EASE_BACK: "#d9a53c",
    BACK_OFF: "#cf5236",
    RETURN_PROTOCOL: "#3d9c9c",
    INJURED: "#7a8291",
  };
  return colors[s.status] ?? "#33415c";
}

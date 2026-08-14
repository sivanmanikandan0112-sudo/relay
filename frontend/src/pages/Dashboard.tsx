import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type ReadinessScore, type Squad } from "../lib/api";
import { STATUS_LABEL, STATUS_COLOR, dataConfidence, scoreIsMeaningful } from "../lib/status";
import { initials } from "../lib/format";
import { DetailDrawer } from "../components/DetailDrawer";
import { NoteModal } from "../components/NoteModal";

const SQUAD_LABEL: Record<Squad["name"], string> = { GIRLS: "Girls", BOYS: "Boys" };

const SUMMARY_DEFS: Array<{ status: ReadinessScore["status"]; label: string }> = [
  { status: "BACK_OFF", label: "back off" },
  { status: "EASE_BACK", label: "ease back" },
  { status: "FRESH", label: "fresh" },
  { status: "RETURN_PROTOCOL", label: "protocol" },
  { status: "INJURED", label: "injured" },
];

function currentIsoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function trend(scores: number[]): { arrow: string; val: string; color: string } {
  if (scores.length < 2) return { arrow: "→", val: "steady", color: "#8a97ad" };
  const diff = scores[scores.length - 1] - scores[scores.length - 2];
  if (diff > 2) return { arrow: "▲", val: `+${diff}`, color: "#4ea373" };
  if (diff < -2) return { arrow: "▼", val: `${diff}`, color: "#cf5236" };
  return { arrow: "→", val: "steady", color: "#8a97ad" };
}

export function Dashboard() {
  const { squadId } = useOutletContext<{ squadId: string | null }>();
  const [scores, setScores] = useState<ReadinessScore[]>([]);
  const [squadName, setSquadName] = useState("");
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!squadId) return;
    const now = new Date();
    api.brief(currentIsoWeek(now), now.getFullYear(), squadId).then(setScores).catch(() => {});
    api.squads().then((squads) => {
      const squad = squads.find((s) => s.id === squadId);
      if (squad) setSquadName(SQUAD_LABEL[squad.name]);
    });
  }, [squadId]);

  return (
    <section>
      <div className="board-header">
        <h1 className="page-title" style={{ margin: 0 }}>
          THE BOARD
        </h1>
        <div className="board-meta">
          {squadName} · {scores.length} athletes · scan top → down
        </div>
      </div>
      <p className="page-subtitle">
        Each athlete is a lane. The edge is their status; the arrow is the{" "}
        <strong style={{ color: "#c3cddd" }}>multi-week trend</strong> vs. their own baseline — a single hard
        day doesn't flag, a drift does. Sorted by who needs you most.
      </p>
      <div className="board-callout">
        <strong style={{ color: "#c9e6d0" }}>Why mood leads the lane:</strong> the research is clear that
        overtraining shows up in how an athlete <em>feels</em> — dropping mood, energy and sleep — days to
        weeks before it shows in their paces or a load number. It's the earliest honest signal, so it sits
        first; the load ratio is only a supporting flag, never the verdict.
      </div>

      <div className="board-summary">
        {SUMMARY_DEFS.map((def) => (
          <div className="board-summary-item" key={def.status}>
            <span className="dot" style={{ background: STATUS_COLOR[def.status] }} />
            <span className="n" style={{ color: STATUS_COLOR[def.status] }}>
              {scores.filter((s) => s.status === def.status).length}
            </span>
            <span className="l">{def.label}</span>
          </div>
        ))}
      </div>

      <div className="lanes">
        {scores.map((s) => {
          const color = STATUS_COLOR[s.status];
          const t = trend(s.athlete.readinessScores.map((r) => r.score));
          const confidence = dataConfidence(s.daysOfHistory);
          return (
            <div className="lane" key={s.id}>
              <div
                className="lane-edge"
                style={{
                  background: s.status === "INJURED" ? "repeating-linear-gradient(45deg,#5c6478 0 5px,#39414f 5px 10px)" : color,
                  animation: s.status === "BACK_OFF" ? "riskpulse 2s ease-in-out infinite" : undefined,
                }}
              />
              <div className="lane-body">
                <button className="lane-who" onClick={() => setDetailFor(s.athleteId)} title="View check-in history & notes">
                  <div className="lane-avatar" style={{ background: color }}>
                    {initials(s.athlete.name)}
                  </div>
                  <div className="lane-name">{s.athlete.name}</div>
                </button>
                <div className="lane-readiness-status">
                  {scoreIsMeaningful(s.status) && (
                    <div className="lane-readiness-num">
                      <span className="val" style={{ color }}>
                        {s.score}
                      </span>
                      <span className="lbl">READY</span>
                      {confidence && (
                        <span style={{ color: confidence.color, fontSize: 12, marginLeft: 2 }} title={confidence.detail}>
                          ⚠
                        </span>
                      )}
                    </div>
                  )}
                  <span className="lane-status-label" style={{ color }}>
                    {STATUS_LABEL[s.status]}
                  </span>
                </div>
                <div className="lane-trend">
                  <span className="arrow" style={{ color: t.color }}>
                    {t.arrow}
                  </span>
                  <span className="val" style={{ color: t.color }}>
                    {t.val}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 30 }} />
                <button className="lane-note-btn" onClick={() => setNoteFor({ id: s.athleteId, name: s.athlete.name })}>
                  Note
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {detailFor && <DetailDrawer athleteId={detailFor} onClose={() => setDetailFor(null)} />}
      {noteFor && (
        <NoteModal
          athleteId={noteFor.id}
          athleteName={noteFor.name}
          onClose={() => setNoteFor(null)}
          onSaved={() => setNoteFor(null)}
        />
      )}
    </section>
  );
}

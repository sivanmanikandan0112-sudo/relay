import { useEffect, useState } from "react";
import { useOutletContext } from "react-router-dom";
import { api, type ReadinessScore, type Squad } from "../lib/api";
import { STATUS_LABEL, STATUS_COLOR, dataConfidence } from "../lib/status";
import { currentIsoWeek } from "../lib/format";
import { Sparkline } from "../components/Sparkline";
import { DetailDrawer } from "../components/DetailDrawer";
import { NoteModal } from "../components/NoteModal";
import { MatchingSection } from "../components/MatchingSection";

const SQUAD_LABEL: Record<Squad["name"], string> = { GIRLS: "Girls", BOYS: "Boys" };

export function Brief() {
  const { squadId } = useOutletContext<{ squadId: string | null }>();
  const [scores, setScores] = useState<ReadinessScore[]>([]);
  const [squadName, setSquadName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [detailFor, setDetailFor] = useState<string | null>(null);
  const [noteFor, setNoteFor] = useState<{ id: string; name: string } | null>(null);

  const week = currentIsoWeek(new Date());
  const year = new Date().getFullYear();

  function refresh() {
    if (!squadId) return;
    api
      .brief(week, year, squadId)
      .then(setScores)
      .catch((e) => setError(e.message));
  }

  useEffect(() => {
    refresh();
    if (!squadId) return;
    api.squads().then((squads) => {
      const squad = squads.find((s) => s.id === squadId);
      if (squad) setSquadName(SQUAD_LABEL[squad.name]);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [squadId, week, year]);

  // Only athletes actually worth a check-in — injured/return-protocol
  // athletes are expected to look "off" and steady ones need no action.
  const flagged = scores.filter((s) => s.status === "BACK_OFF" || s.status === "EASE_BACK");
  const briefList = flagged.slice(0, 4);
  const steadyCount = scores.filter((s) => s.status === "FRESH").length;
  const protocolCount = scores.filter((s) => s.status === "RETURN_PROTOCOL").length;
  const injuredCount = scores.filter((s) => s.status === "INJURED").length;

  return (
    <section className="brief-wrap">
      <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", marginBottom: 2 }}>
        <div className="eyebrow-mono">
          MONDAY BRIEF · WEEK {week} · {squadName}
        </div>
      </div>
      <h1 className="page-title">Talk to these {briefList.length} this week.</h1>
      <p className="page-subtitle">
        Relay read every athlete's trend, wellness and load, and turned it into a decision — not a
        dashboard. Start at the top. The rest of the squad is steady.
      </p>

      {error && <p className="error">{error}</p>}

      {scores.length > 0 && briefList.length === 0 && (
        <div className="brief-none">
          <span style={{ fontSize: 22, color: "#4ea373" }}>✓</span>
          <div style={{ fontSize: 14.5, color: "#c9e6d0", lineHeight: 1.5 }}>
            Nobody's drifting this week — the whole squad is riding a healthy trend. Enjoy the quiet Monday.
          </div>
        </div>
      )}

      <div className="brief-list">
        {briefList.map((s, i) => {
          const color = STATUS_COLOR[s.status];
          const confidence = dataConfidence(s.daysOfHistory);
          return (
            <article className="brief-card" key={s.id}>
              <div
                className="brief-card-edge"
                style={{
                  background: color,
                  animation: s.status === "BACK_OFF" ? "riskpulse 2s ease-in-out infinite" : undefined,
                }}
              />
              <div className="brief-card-body">
                <div className="brief-card-top">
                  <div className="brief-rank" style={{ background: color }}>
                    {i + 1}
                  </div>
                  <div className="brief-name">{s.athlete.name}</div>
                  <span className="brief-badge" style={{ color, borderColor: color }}>
                    {STATUS_LABEL[s.status]}
                  </span>
                  <div style={{ flex: 1 }} />
                  <div className="brief-score-block">
                    <Sparkline values={s.athlete.readinessScores.map((r) => r.score)} colorVar={color} width={66} height={22} />
                    <div className="brief-score-num">
                      <span className="val" style={{ color }}>
                        {s.score}
                      </span>
                      <span className="lbl">READY</span>
                    </div>
                  </div>
                </div>
                {confidence && (
                  <div className="brief-plain" style={{ color: confidence.color, fontSize: 11.5 }} title={confidence.detail}>
                    ⚠ {confidence.label === "Building" ? confidence.label : `Settling in — ${confidence.label}`}
                  </div>
                )}
                <div className="brief-plain">{s.summary}</div>
                <div className="brief-actions">
                  <button className="btn-primary" onClick={() => setNoteFor({ id: s.athleteId, name: s.athlete.name })}>
                    Leave a note
                  </button>
                  <button className="btn-secondary" onClick={() => setDetailFor(s.athleteId)}>
                    See the why
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      {scores.length > 0 && (
        <div className="brief-stats-row">
          <div className="brief-stat">
            <span className="n" style={{ color: "#4ea373" }}>
              {steadyCount}
            </span>
            <span className="l">fresh · no action needed</span>
          </div>
          <div className="brief-stat">
            <span className="n" style={{ color: "#3d9c9c" }}>
              {protocolCount}
            </span>
            <span className="l">on return protocol</span>
          </div>
          <div className="brief-stat">
            <span className="n" style={{ color: "#7a8291" }}>
              {injuredCount}
            </span>
            <span className="l">out injured</span>
          </div>
        </div>
      )}
      <div className="brief-footnote">
        Readiness blends each athlete's load trend with their self-reported wellness — higher is fresher. Need
        the whole squad at a glance? See the <span style={{ color: "#8a97ad" }}>Dashboard</span>.
      </div>

      {scores.length > 0 && <MatchingSection scores={scores} onRefresh={refresh} />}

      {detailFor && (
        <DetailDrawer athleteId={detailFor} onClose={() => setDetailFor(null)} onRemoved={refresh} onChanged={refresh} />
      )}
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

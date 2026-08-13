import { useEffect, useState } from "react";
import { api, type ReadinessScoreRecord, type WellnessEntry } from "../lib/api";
import { formatShortDate } from "../lib/format";
import { STATUS_COLOR, STATUS_LABEL, scoreIsMeaningful } from "../lib/status";
import { useAuth } from "../context/AuthContext";

const FIELDS: Array<{ key: "sleep" | "energy" | "mood" | "motivation" | "soreness"; label: string; hint: string }> = [
  { key: "sleep", label: "Sleep", hint: "1 rough · 5 great" },
  { key: "energy", label: "Energy", hint: "1 drained · 5 bouncy" },
  { key: "mood", label: "Mood", hint: "1 flat/irritable · 5 great" },
  { key: "motivation", label: "Motivation", hint: "1 dreading it · 5 fired up" },
  { key: "soreness", label: "Soreness", hint: "1 none · 5 very sore" },
];

export function AthleteCheckin() {
  const { user } = useAuth();
  const athleteId = user?.athleteId ?? null;
  const [history, setHistory] = useState<WellnessEntry[]>([]);
  const [draft, setDraft] = useState({ sleep: 3, energy: 3, mood: 3, motivation: 3, soreness: 3 });
  const [msg, setMsg] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessScoreRecord | null>(null);

  function refresh() {
    if (!athleteId) return;
    api.wellnessForAthlete(athleteId).then(setHistory);
  }

  useEffect(refresh, [athleteId]);

  // Whether today already has a check-in isn't session state -- it's a
  // fact about the data, so it has to survive a reload or coming back to
  // this page later, not just live in `submitted` for as long as this
  // component happens to stay mounted. Multiple check-ins a day are
  // allowed (each POST creates a new row rather than overwriting), so
  // this is the *latest* one for today, matching history's own newest-first order.
  const todayEntry = history.find((h) => new Date(h.date).toDateString() === new Date().toDateString()) ?? null;

  // Once today's entry shows up (on load, or right after a submit),
  // reflect its real values instead of leaving the sliders at their
  // neutral 3/3/3/3/3 default -- otherwise re-submitting without
  // touching anything would silently overwrite an honest rating with a
  // fake "everything's a 3".
  useEffect(() => {
    if (!todayEntry) return;
    setDraft({
      sleep: todayEntry.sleep,
      energy: todayEntry.energy,
      mood: todayEntry.mood,
      motivation: todayEntry.motivation,
      soreness: todayEntry.soreness,
    });
    setMsg(todayEntry.msg ?? "");
    setSubmitted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [todayEntry?.id]);

  // Only fetch if the athlete has opted in from Profile -- the endpoint
  // itself also enforces this, this just avoids a pointless call otherwise.
  useEffect(() => {
    if (!user?.readinessShared) {
      setReadiness(null);
      return;
    }
    api.myReadiness().then((res) => setReadiness(res.latest));
  }, [user?.readinessShared]);

  if (!athleteId) {
    return (
      <div className="ath-wrap">
        <p className="page-subtitle">
          Your account isn't linked to an athlete profile yet — ask your coach to set that up.
        </p>
      </div>
    );
  }

  const firstName = user?.firstName ?? "there";
  const messages = history.filter((h) => h.msg);

  async function handleSubmit() {
    setSaving(true);
    try {
      await api.submitWellness({ ...draft, msg: msg.trim() || undefined });
      setSubmitted(true);
      refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="ath-wrap">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2, flexWrap: "wrap" }}>
        <div className="eyebrow-mono" style={{ color: "#8a97ad" }}>
          HEY {firstName.toUpperCase()} · 10 SECONDS
        </div>
        <span className="streak-badge">
          ✓ {history.length} check-ins · {history.length}-day streak
        </span>
      </div>
      <h1 className="page-title" style={{ margin: "0 0 6px" }}>
        How are you feeling today?
      </h1>
      <p className="page-subtitle" style={{ fontSize: 13, maxWidth: "56ch" }}>
        This is the earliest sign of overtraining — how you feel shifts before your times do. It stays
        between you and your coach.
      </p>

      {user?.readinessShared && (
        <div className="panel" style={{ marginTop: 0, marginBottom: 16 }}>
          <div className="eyebrow-mono" style={{ marginBottom: 6, color: "#8a97ad" }}>
            YOUR READINESS
          </div>
          {readiness ? (
            <>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                {scoreIsMeaningful(readiness.status) && (
                  <div style={{ fontSize: 32, fontWeight: 700, color: STATUS_COLOR[readiness.status] }}>
                    {readiness.score}
                  </div>
                )}
                <div style={{ fontSize: 14, fontWeight: 600, color: STATUS_COLOR[readiness.status] }}>
                  {STATUS_LABEL[readiness.status]}
                </div>
              </div>
              <p style={{ fontSize: 13, color: "var(--text-dim)", marginTop: 4 }}>{readiness.summary}</p>
            </>
          ) : (
            <p className="page-subtitle" style={{ fontSize: 13, margin: 0 }}>
              Not enough history yet — check back after a couple weeks of check-ins and runs.
            </p>
          )}
        </div>
      )}

      <div className="checkin-panel">
        {FIELDS.map((field) => (
          <div className="checkin-field" key={field.key}>
            <div className="checkin-field-label">
              <div className="name">{field.label}</div>
              <div className="hint">{field.hint}</div>
            </div>
            <div className="checkin-opts">
              {[1, 2, 3, 4, 5].map((v) => (
                <button
                  key={v}
                  className={`pill-btn ${draft[field.key] === v ? "selected" : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, [field.key]: v }))}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        ))}
        <div className="checkin-divider" />
        <div className="field-hint">ANYTHING TO TELL YOUR COACH? · OPTIONAL</div>
        <textarea
          className="ath-textarea"
          value={msg}
          onChange={(e) => setMsg(e.target.value)}
          placeholder="e.g. Right shin a little tender on the downhills."
        />
        <button className="checkin-submit" disabled={saving} onClick={handleSubmit}>
          {saving ? "Saving…" : submitted ? "Update today's check-in" : "Submit today's check-in"}
        </button>
        {submitted && (
          <div className="checkin-confirm">
            <span>✓</span>
            <span>Today's check-in is in — change anything above and update it anytime.</span>
          </div>
        )}
      </div>

      {submitted && (
        <div className="confirm-banner">
          <span className="icon">✓</span>
          <div className="text">
            Logged. We deliberately don't show you your running average here — so today's rating is honest,
            not nudged toward yesterday's. Your coach sees the pattern.
          </div>
        </div>
      )}

      {messages.length > 0 && (
        <>
          <div className="field-hint" style={{ margin: "20px 0 8px" }}>
            WHAT YOU'VE SHARED
          </div>
          <div className="shared-msgs">
            {messages.map((m) => (
              <div className="shared-msg" key={m.id}>
                <div className="date">{formatShortDate(m.date)}</div>
                <div className="text">{m.msg}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

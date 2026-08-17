import { useEffect, useState } from "react";
import { api, type ReadinessScoreRecord, type WellnessEntry } from "../lib/api";
import { dayLabel, formatShortDate, recentDayOptions, todayKey } from "../lib/format";
import { STATUS_COLOR, STATUS_LABEL, dataConfidence, scoreIsMeaningful } from "../lib/status";
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
  const [selectedDay, setSelectedDay] = useState(todayKey());
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

  const isToday = selectedDay === todayKey();

  // Whether the selected day already has a check-in isn't session state
  // -- it's a fact about the data, so it has to survive a reload or
  // coming back to this page later, not just live in `submitted` for as
  // long as this component happens to stay mounted. One check-in per
  // athlete per day (see backend's upsert), so this is at most one entry.
  const selectedEntry = history.find((h) => h.day.slice(0, 10) === selectedDay) ?? null;

  // Once the selected day's entry shows up (on load, right after a
  // submit, or from switching which day is picked), reflect its real
  // values instead of leaving the sliders at their neutral 3/3/3/3/3
  // default -- otherwise re-submitting without touching anything would
  // silently overwrite an honest rating with a fake "everything's a 3".
  // Switching to a day with *no* entry yet resets back to that same
  // neutral default, not whatever the previously-selected day left behind.
  useEffect(() => {
    if (!selectedEntry) {
      setDraft({ sleep: 3, energy: 3, mood: 3, motivation: 3, soreness: 3 });
      setMsg("");
      setSubmitted(false);
      return;
    }
    setDraft({
      sleep: selectedEntry.sleep,
      energy: selectedEntry.energy,
      mood: selectedEntry.mood,
      motivation: selectedEntry.motivation,
      soreness: selectedEntry.soreness,
    });
    setMsg(selectedEntry.msg ?? "");
    setSubmitted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEntry?.id, selectedDay]);

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
      // Always pass `day` explicitly, even for "today" -- selectedDay is
      // already the browser's own local calendar day (see lib/format.ts's
      // todayKey()), and omitting it would let the backend fall back to
      // its own UTC "now" instead, which is the exact day-mismatch bug
      // todayKey()'s own comment explains (an evening submission landing
      // on the wrong calendar day once UTC has already rolled over).
      await api.submitWellness({ ...draft, msg: msg.trim() || undefined, day: selectedDay });
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
        {isToday ? "How are you feeling today?" : `How were you feeling ${dayLabel(selectedDay).toLowerCase()}?`}
      </h1>
      <p className="page-subtitle" style={{ fontSize: 13, maxWidth: "56ch" }}>
        This is the earliest sign of overtraining — how you feel shifts before your times do. It stays
        between you and your coach.
      </p>

      <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
        <span className="field-hint" style={{ color: "var(--text-dim-2)", margin: 0 }}>
          LOGGING FOR
        </span>
        <select className="ath-input" value={selectedDay} onChange={(e) => setSelectedDay(e.target.value)}>
          {recentDayOptions().map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {!isToday && <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-faint)" }}>catching up on a missed day</span>}
      </label>

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
              {scoreIsMeaningful(readiness.status) &&
                (() => {
                  const confidence = dataConfidence(readiness.daysOfHistory);
                  return (
                    confidence && (
                      <p style={{ fontSize: 12, color: confidence.color, marginTop: 6 }}>⚠ {confidence.detail}</p>
                    )
                  );
                })()}
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
          {saving
            ? "Saving…"
            : submitted
              ? `Update ${isToday ? "today's" : `${dayLabel(selectedDay).toLowerCase()}'s`} check-in`
              : `Submit ${isToday ? "today's" : `${dayLabel(selectedDay).toLowerCase()}'s`} check-in`}
        </button>
        {submitted && (
          <div className="checkin-confirm">
            <span>✓</span>
            <span>
              {isToday ? "Today's" : `${dayLabel(selectedDay)}'s`} check-in is in — change anything above and update it anytime.
            </span>
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

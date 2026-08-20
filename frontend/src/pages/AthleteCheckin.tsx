import { useEffect, useState } from "react";
import { api, type Note, type ReadinessScoreRecord, type Run, type WellnessEntry } from "../lib/api";
import { computeStreak, dayLabel, formatDuration, formatShortDate, recentDayOptions, todayKey } from "../lib/format";
import { STATUS_COLOR, STATUS_LABEL, dataConfidence, scoreIsMeaningful } from "../lib/status";
import { useAuth } from "../context/AuthContext";
import { ConfirmRunModal } from "../components/ConfirmRunModal";

const FIELDS: Array<{ key: "sleep" | "energy" | "mood" | "motivation" | "soreness"; label: string; hint: string }> = [
  { key: "sleep", label: "Sleep", hint: "1 rough · 5 great" },
  { key: "energy", label: "Energy", hint: "1 drained · 5 bouncy" },
  { key: "mood", label: "Mood", hint: "1 flat/irritable · 5 great" },
  { key: "motivation", label: "Motivation", hint: "1 dreading it · 5 fired up" },
  { key: "soreness", label: "Soreness", hint: "1 none · 5 very sore" },
];

function clampInt(text: string, min: number, max: number): number {
  const n = Math.round(Number(text) || 0);
  return Math.max(min, Math.min(max, n));
}

// Rounds to 2 decimal places without letting the field hold more.
function roundDistance(text: string): number | undefined {
  const n = Number(text);
  if (!text.trim() || Number.isNaN(n)) return undefined;
  return Math.round(n * 100) / 100;
}

export function AthleteCheckin() {
  const { user } = useAuth();
  const athleteId = user?.athleteId ?? null;
  const [history, setHistory] = useState<WellnessEntry[]>([]);
  const [runs, setRuns] = useState<Run[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [selectedDay, setSelectedDay] = useState(todayKey());
  const [draft, setDraft] = useState({ sleep: 3, energy: 3, mood: 3, motivation: 3, soreness: 3 });
  const [msg, setMsg] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readiness, setReadiness] = useState<ReadinessScoreRecord | null>(null);

  // --- Runs for the selected day ---------------------------------------
  // Logging a run used to live on a separate tab entirely -- easy to
  // finish a check-in and never open it, silently leaving the readiness
  // pipeline that day with only half its real signal (RPE/duration is
  // the actual training-load half of the score, not just the subjective
  // wellness ratings above). One shared LOGGING FOR day picker now
  // governs both: catching up a missed day means catching up its whole
  // record, not just the check-in half of it.
  const [addingRun, setAddingRun] = useState(false);
  const [title, setTitle] = useState("");
  const [distance, setDistance] = useState("");
  const [hh, setHh] = useState("0");
  const [mm, setMm] = useState("0");
  const [ss, setSs] = useState("0");
  const [rpe, setRpe] = useState<number | null>(null);
  const [confirmingRun, setConfirmingRun] = useState(false);
  const [savingRun, setSavingRun] = useState(false);

  function refresh() {
    if (!athleteId) return;
    api.wellnessForAthlete(athleteId).then(setHistory);
    api.runsForAthlete(athleteId).then(setRuns);
    // Notes also show on History (AthleteHistory.tsx), but this is the
    // page an athlete actually lands on first -- a note left only there
    // was too easy to never see at all.
    api.notesForAthlete(athleteId).then(setNotes);
  }

  useEffect(refresh, [athleteId]);

  const isToday = selectedDay === todayKey();

  // Whether the selected day already has a check-in isn't session state
  // -- it's a fact about the data, so it has to survive a reload or
  // coming back to this page later, not just live in `submitted` for as
  // long as this component happens to stay mounted. One check-in per
  // athlete per day (see backend's upsert), so this is at most one entry.
  const selectedEntry = history.find((h) => h.day.slice(0, 10) === selectedDay) ?? null;

  // TrainingLoad has no `day` field like WellnessEntry does -- only a raw
  // `date` timestamp, stamped with the live clock for a same-day
  // submission. Matching it to selectedDay via todayKey(new Date(r.date))
  // (the browser's own local calendar day), not r.date.slice(0, 10)
  // (always UTC), for the exact same reason todayKey's own comment
  // explains: an evening run logged after ~7pm Central would otherwise
  // silently match tomorrow's date instead of today's.
  const runsForDay = runs.filter((r) => todayKey(new Date(r.date)) === selectedDay);

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

  // Switching days also closes any in-progress "add a run" form -- half-
  // filled fields for the day you just left would be confusing sitting
  // under a different day's header.
  useEffect(() => {
    setAddingRun(false);
    setTitle("");
    setDistance("");
    setHh("0");
    setMm("0");
    setSs("0");
    setRpe(null);
  }, [selectedDay]);

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
  // A real consecutive-day count, not just history.length (which used to
  // be reused for both "X check-ins" and "X-day streak" -- a gappy
  // history of e.g. 15 check-ins spread across 30 days would have
  // falsely read as a 15-day streak).
  const streak = computeStreak(history.map((h) => h.day.slice(0, 10)));

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

  const runDurationMin = Number(hh) * 60 + Number(mm) + Number(ss) / 60;
  const canAddRun = title.trim().length > 0 && rpe != null && runDurationMin > 0;

  async function handleConfirmRun() {
    if (!canAddRun || rpe == null) return;
    setSavingRun(true);
    try {
      await api.logRun({
        runType: title.trim(),
        distanceMiles: roundDistance(distance),
        durationMin: runDurationMin,
        rpe,
        day: selectedDay,
      });
      setTitle("");
      setDistance("");
      setHh("0");
      setMm("0");
      setSs("0");
      setRpe(null);
      setConfirmingRun(false);
      // Deliberately left open, not closed -- a two-a-day means logging a
      // second run right after the first one, and the confirmation below
      // (the fresh entry appearing in the list) is feedback enough that
      // the first one actually saved.
      refresh();
    } finally {
      setSavingRun(false);
    }
  }

  async function handleDeleteRun(id: string) {
    await api.deleteRun(id);
    refresh();
  }

  return (
    <div className="ath-wrap">
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2, flexWrap: "wrap" }}>
        <div className="eyebrow-mono" style={{ color: "#8a97ad" }}>
          HEY {firstName.toUpperCase()} · 10 SECONDS
        </div>
        <span className="streak-badge">
          ✓ {history.length} check-ins · {streak}-day streak
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

      <div className="checkin-panel" style={{ marginTop: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div className="field-hint" style={{ margin: 0 }}>
            {isToday ? "TODAY'S RUNS" : `RUNS · ${dayLabel(selectedDay).toUpperCase()}`}
          </div>
          {!addingRun && (
            <button className="btn-secondary" onClick={() => setAddingRun(true)}>
              + Add a run
            </button>
          )}
        </div>

        {runsForDay.length === 0 && !addingRun && (
          <p className="page-subtitle" style={{ fontSize: 13, margin: "8px 0 0" }}>
            No runs logged {isToday ? "yet today" : "for this day"} — perfectly normal on a rest day.
          </p>
        )}

        {runsForDay.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: runsForDay.length > 0 ? 10 : 0 }}>
            {runsForDay.map((r) => (
              <div className="run-item" key={r.id}>
                <div className="run-item-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="run-item-type">{r.runType}</div>
                    <div className="run-item-meta">
                      {r.distanceMiles != null ? `${r.distanceMiles.toFixed(2)}mi · ` : ""}
                      {formatDuration(r.durationMin)} · effort {r.rpe}/10
                    </div>
                  </div>
                  <button className="run-item-delete" title="Remove run" onClick={() => handleDeleteRun(r.id)}>
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {addingRun && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <label className="field-hint" style={{ display: "block", marginBottom: 4, color: "var(--text-dim-2)" }}>
              Title
            </label>
            <input
              className="ath-input"
              style={{ width: "100%", marginBottom: 10 }}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Easy 5mi, Tempo intervals"
              autoFocus
            />

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="field-hint" style={{ color: "var(--text-dim-2)" }}>
                  Distance (miles)
                </span>
                <input
                  className="ath-input"
                  style={{ width: 130 }}
                  type="number"
                  step="0.01"
                  min="0"
                  max="200"
                  value={distance}
                  onChange={(e) => setDistance(e.target.value)}
                  placeholder="0.00"
                />
              </label>

              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span className="field-hint" style={{ color: "var(--text-dim-2)" }}>
                  Duration (hh:mm:ss)
                </span>
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input
                    className="ath-input"
                    style={{ width: 52, textAlign: "center" }}
                    type="number"
                    min={0}
                    max={23}
                    value={hh}
                    onChange={(e) => setHh(String(clampInt(e.target.value, 0, 23)))}
                  />
                  <span style={{ color: "var(--text-dim)" }}>:</span>
                  <input
                    className="ath-input"
                    style={{ width: 52, textAlign: "center" }}
                    type="number"
                    min={0}
                    max={59}
                    value={mm}
                    onChange={(e) => setMm(String(clampInt(e.target.value, 0, 59)))}
                  />
                  <span style={{ color: "var(--text-dim)" }}>:</span>
                  <input
                    className="ath-input"
                    style={{ width: 52, textAlign: "center" }}
                    type="number"
                    min={0}
                    max={59}
                    value={ss}
                    onChange={(e) => setSs(String(clampInt(e.target.value, 0, 59)))}
                  />
                </div>
              </label>
            </div>

            <div className="rpe-row" style={{ marginTop: 14 }}>
              <div style={{ flex: 1, minWidth: 240 }}>
                <div className="field-hint" style={{ marginBottom: 6 }}>
                  How hard did it feel? · <span style={{ color: rpe ? "#d9703f" : "#7c88a0" }}>{rpe ? `${rpe}/10` : "not set yet"}</span>
                </div>
                <div className="rpe-picker">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((v) => (
                    <button key={v} className={`rpe-btn ${rpe === v ? "selected" : ""}`} onClick={() => setRpe(v)}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className={`add-run-btn ${canAddRun ? "enabled" : "disabled"}`} disabled={!canAddRun} onClick={() => setConfirmingRun(true)}>
                  Add run
                </button>
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => {
                    setAddingRun(false);
                    setTitle("");
                    setDistance("");
                    setHh("0");
                    setMm("0");
                    setSs("0");
                    setRpe(null);
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
            {!canAddRun && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "#7c88a0", marginTop: 8 }}>
                Add a title, a duration, and pick how hard it felt to log the run.
              </div>
            )}
          </div>
        )}
      </div>

      {notes.length > 0 && (
        <>
          <div className="field-hint" style={{ margin: "20px 0 8px" }}>
            NOTES FROM YOUR COACH
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {notes.map((n) => (
              <div className="run-note" key={n.id} style={{ borderRadius: 9, border: "1px solid #5a3f16" }}>
                <span className="icon">✍</span>
                <div>
                  <div className="date">
                    {n.coach.name} · {formatShortDate(n.createdAt)}
                  </div>
                  <div className="text">{n.body}</div>
                </div>
              </div>
            ))}
          </div>
        </>
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

      {confirmingRun && (
        <ConfirmRunModal
          title={title.trim()}
          distanceMiles={roundDistance(distance)}
          durationMin={runDurationMin}
          rpe={rpe ?? 0}
          dayLabel={dayLabel(selectedDay)}
          saving={savingRun}
          onCancel={() => setConfirmingRun(false)}
          onConfirm={handleConfirmRun}
        />
      )}
    </div>
  );
}

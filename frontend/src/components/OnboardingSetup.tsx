import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { PUSH_CONFIGURED, pushSupported } from "../lib/push";
import { DEFAULT_REMINDER_HOUR, REMINDER_HOUR_OPTIONS, formatHour } from "../lib/format";
import { usePushNotifications } from "../hooks/usePushNotifications";
import { useReminderHour } from "../hooks/useReminderHour";
import { useReadinessVisibility } from "../hooks/useReadinessVisibility";

// Shown exactly once, right after an athlete clears GenderGate (or, for
// a coach, right after their very first login) -- everything here
// already lives permanently in My Profile, so this is purely a one-time
// nudge toward settings a new user would otherwise never know existed
// unless they happened to go looking. Skippable on purpose (see
// Layout.tsx's own comment on why this isn't a hard block the way
// GenderGate is): a "do you want notifications?" prompt forcing a
// decision before someone's even checked in once is worse UX than
// letting them skip and find it later.
export function OnboardingSetup() {
  const { user, updateUser } = useAuth();
  const { readinessSaving, readinessError, handleToggleReadinessSharing } = useReadinessVisibility();
  const { pushEndpoint, pushChecked, pushSaving, pushError, handleTogglePush } = usePushNotifications();
  const { reminderSaving, reminderError, handleSetReminderHour } = useReminderHour();

  async function finish() {
    // Fire-and-forget-ish, but not actually forgotten: whether this
    // succeeds or fails, the user should still get into the app --
    // getting stuck on this screen because of a network blip would be a
    // much worse outcome than occasionally re-showing it once.
    try {
      await api.completeOnboarding();
    } finally {
      updateUser({ onboardingCompletedAt: new Date().toISOString() });
    }
  }

  const showPushSection = user?.role === "ATHLETE" && PUSH_CONFIGURED && pushChecked && pushSupported();
  const showCoachReminderSection = user?.role === "COACH" && PUSH_CONFIGURED;

  return (
    <div className="login-screen">
      <div className="login-card" style={{ width: 460 }}>
        <h1>RELAY</h1>
        <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
          A couple of quick settings before you get started — every one of these can be changed
          anytime from My Profile, so nothing here is a one-time decision.
        </p>

        {showPushSection && (
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <input type="checkbox" checked={!!pushEndpoint} disabled={pushSaving} onChange={(e) => handleTogglePush(e.target.checked)} />
              Remind me on this device if I haven't checked in
            </label>
            {pushError && (
              <p className="error" style={{ marginTop: 6 }}>
                {pushError}
              </p>
            )}
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 10, flexWrap: "wrap" }}>
              Remind me at
              <select
                className="ath-input"
                style={{ width: "auto" }}
                value={user?.reminderHour ?? ""}
                disabled={reminderSaving}
                onChange={(e) => handleSetReminderHour(e.target.value)}
              >
                <option value="">Whatever your coach has set (currently {formatHour(DEFAULT_REMINDER_HOUR)})</option>
                {REMINDER_HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {showCoachReminderSection && (
          <div>
            <p style={{ color: "var(--text-dim)", margin: 0, fontSize: 13.5 }}>
              Default reminder time for your team — the hour Relay nudges an athlete to check in,
              for anyone on your roster who hasn't picked their own time.
            </p>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginTop: 8, flexWrap: "wrap" }}>
              Remind at
              <select
                className="ath-input"
                style={{ width: "auto" }}
                value={user?.reminderHour ?? ""}
                disabled={reminderSaving}
                onChange={(e) => handleSetReminderHour(e.target.value)}
              >
                <option value="">Relay's default ({formatHour(DEFAULT_REMINDER_HOUR)})</option>
                {REMINDER_HOUR_OPTIONS.map((h) => (
                  <option key={h} value={h}>
                    {formatHour(h)}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        {reminderError && <p className="error">{reminderError}</p>}

        {user?.role === "ATHLETE" && (
          <div>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
              <input
                type="checkbox"
                checked={user?.readinessShared ?? false}
                disabled={readinessSaving}
                onChange={(e) => handleToggleReadinessSharing(e.target.checked)}
              />
              Show me my own readiness score
            </label>
            <p style={{ color: "var(--text-faint)", fontSize: 12, marginTop: 4 }}>
              Off by default, on purpose — keeps your daily check-in an honest answer, not something
              to manage toward a number.
            </p>
            {readinessError && <p className="error">{readinessError}</p>}
          </div>
        )}

        <button className="btn-primary" onClick={finish}>
          Save and continue
        </button>
        <button
          type="button"
          onClick={finish}
          style={{ background: "none", border: "none", color: "var(--text-faint)", fontSize: 12.5, cursor: "pointer", textDecoration: "underline", padding: 0 }}
        >
          Skip for now — I'll do this later in My Profile
        </button>
      </div>
    </div>
  );
}

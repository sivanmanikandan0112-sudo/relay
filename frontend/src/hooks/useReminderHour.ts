import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

/**
 * Saves a reminder-hour choice -- an athlete's own override, or a
 * coach's default for their roster (same field either way, see
 * backend's User.reminderHour). Shared between Profile.tsx (permanent
 * settings) and OnboardingSetup.tsx (the one-time first-login prompt).
 */
export function useReminderHour() {
  const { updateUser } = useAuth();
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderError, setReminderError] = useState<string | null>(null);

  async function handleSetReminderHour(raw: string) {
    const hour = raw === "" ? null : Number(raw);
    setReminderError(null);
    setReminderSaving(true);
    try {
      await api.setReminderHour(hour);
      updateUser({ reminderHour: hour });
    } catch (err) {
      setReminderError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setReminderSaving(false);
    }
  }

  return { reminderSaving, reminderError, handleSetReminderHour };
}

import { useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";

/**
 * Toggles an athlete's own opt-in to seeing their own readiness score
 * (off by default -- see Athlete.shareReadinessWithAthlete's own
 * comment). Shared between Profile.tsx (permanent settings) and
 * OnboardingSetup.tsx (the one-time first-login prompt).
 */
export function useReadinessVisibility() {
  const { updateUser } = useAuth();
  const [readinessSaving, setReadinessSaving] = useState(false);
  const [readinessError, setReadinessError] = useState<string | null>(null);

  async function handleToggleReadinessSharing(share: boolean) {
    setReadinessError(null);
    setReadinessSaving(true);
    try {
      await api.setReadinessVisibility(share);
      updateUser({ readinessShared: share });
    } catch (err) {
      setReadinessError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setReadinessSaving(false);
    }
  }

  return { readinessSaving, readinessError, handleToggleReadinessSharing };
}

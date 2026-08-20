import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { PUSH_CONFIGURED, getExistingSubscription, pushSupported, subscribeToPush, unsubscribeFromPush } from "../lib/push";

/**
 * This device's push-subscription state, plus a toggle to enable/disable
 * it. Shared between Profile.tsx (permanent settings) and
 * OnboardingSetup.tsx (the one-time first-login prompt) rather than each
 * owning its own copy of this state machine -- both need the exact same
 * subscribe/unsubscribe behavior, just with different surrounding copy.
 */
export function usePushNotifications() {
  const { user } = useAuth();
  const [pushEndpoint, setPushEndpoint] = useState<string | null>(null); // this device's current subscription, if any -- null until checked
  const [pushChecked, setPushChecked] = useState(false);
  const [pushSaving, setPushSaving] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  // Reads this device's actual current subscription state from the
  // browser (not from the backend -- the backend only knows what was
  // last POSTed, but the source of truth for "is this device subscribed
  // right now" is the Push API itself, e.g. after the user cleared site
  // data or revoked the permission outside the app).
  useEffect(() => {
    // Athlete-only, same as the backend: sendCheckinReminders only ever
    // joins through Athlete, so a coach's own subscription would never
    // receive anything -- no reason to even check their device state.
    if (user?.role !== "ATHLETE" || !PUSH_CONFIGURED || !pushSupported()) {
      setPushChecked(true);
      return;
    }
    getExistingSubscription()
      .then((sub) => setPushEndpoint(sub?.endpoint ?? null))
      .finally(() => setPushChecked(true));
  }, [user?.role]);

  async function handleTogglePush(enable: boolean) {
    setPushError(null);
    setPushSaving(true);
    try {
      if (enable) {
        const subscription = await subscribeToPush();
        await api.subscribePush(subscription);
        setPushEndpoint(subscription.endpoint);
      } else if (pushEndpoint) {
        await api.unsubscribePush(pushEndpoint);
        await unsubscribeFromPush();
        setPushEndpoint(null);
      }
    } catch (err) {
      setPushError(err instanceof Error ? err.message : "Couldn't save that");
    } finally {
      setPushSaving(false);
    }
  }

  return { pushEndpoint, pushChecked, pushSaving, pushError, handleTogglePush };
}

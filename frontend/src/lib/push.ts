// Web Push helpers -- no wrapper library, same "use the platform API
// directly" spirit as lib/google.ts and the rest of this app.

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;

/** Whether the frontend is even built with a VAPID key -- Profile.tsx's whole push section is hidden without this, same "unset -> nothing renders" convention as GOOGLE_CONFIGURED. */
export const PUSH_CONFIGURED = !!VAPID_PUBLIC_KEY;

/** Whether this browser supports the two APIs push needs at all (Safari on older iOS, some in-app browsers, etc. don't). */
export function pushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window;
}

// pushManager.subscribe() wants the VAPID public key as a raw Uint8Array,
// not the base64url string it's normally handed around as (e.g. in the
// backend's VAPID_PUBLIC_KEY env var, or this file's own constant above).
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const base64Safe = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64Safe);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export interface PushSubscriptionData {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

function toSubscriptionData(subscription: PushSubscription): PushSubscriptionData {
  const json = subscription.toJSON();
  return { endpoint: json.endpoint!, keys: { p256dh: json.keys!.p256dh, auth: json.keys!.auth } };
}

/** The current subscription for this device, if any -- doesn't request permission or create one. */
export async function getExistingSubscription(): Promise<PushSubscriptionData | null> {
  if (!pushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription ? toSubscriptionData(subscription) : null;
}

/**
 * Requests notification permission (if not already granted/denied) and
 * subscribes this device to Web Push. Throws if permission is denied or
 * VAPID isn't configured -- callers show that as an inline error, the
 * same pattern every other Profile.tsx section already uses.
 */
export async function subscribeToPush(): Promise<PushSubscriptionData> {
  if (!VAPID_PUBLIC_KEY) throw new Error("Push notifications aren't configured");
  if (!pushSupported()) throw new Error("This browser doesn't support push notifications");

  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notification permission was denied");

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true, // required by the spec -- every push must show a visible notification, never a silent background wakeup
    // TS's lib.dom typings for PushSubscriptionOptionsInit want an
    // ArrayBuffer-backed BufferSource specifically, not the more general
    // Uint8Array<ArrayBufferLike> urlBase64ToUint8Array returns -- a real
    // runtime-safe cast (Uint8Array always works as a BufferSource here).
    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource,
  });
  return toSubscriptionData(subscription);
}

/** Unsubscribes this device at the browser/push-service level. Callers still need to tell the backend separately (DELETE /api/me/push-subscription) so it stops trying to send here. */
export async function unsubscribeFromPush(): Promise<void> {
  if (!pushSupported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) await subscription.unsubscribe();
}

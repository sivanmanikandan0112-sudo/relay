import webpush from "web-push";
import { env } from "./env.js";

/** Whether Web Push is configured -- routes/jobs use this to decide whether subscribing even does anything server-side. */
export const pushEnabled = !!(env.vapidPublicKey && env.vapidPrivateKey);

if (pushEnabled) {
  webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey!, env.vapidPrivateKey!);
}

if (env.nodeEnv === "production" && !pushEnabled) {
  // Same non-fatal, loud-on-startup pattern as lib/email.ts's missing
  // RESEND_API_KEY warning -- push is an enhancement, the app boots and
  // runs fine without it, but a real deployment silently missing it
  // (subscribe button does nothing, no reminders ever go out) should be
  // discoverable from the logs, not just eventually noticed.
  console.warn(
    "[push] NODE_ENV=production but VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY are not set -- push notifications " +
      "are fully disabled. Generate a keypair with `npx web-push generate-vapid-keys` to fix this."
  );
}

export interface PushSubscriptionKeys {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string; // deep-link the notification click should open, e.g. "/checkin"
}

export type SendPushResult =
  | "sent"
  | "unconfigured" // VAPID keys aren't set -- see pushEnabled above
  | "gone" // push service returned 404/410: this subscription is dead and should be deleted
  | "failed"; // any other error (network blip, malformed payload, etc.) -- not fatal, just not delivered

/**
 * Sends one Web Push notification. Never throws -- same trySendEmail
 * spirit as lib/email.ts: a push failure should never turn an otherwise-
 * successful caller (the reminder cron job) into a crash, it should just
 * be logged and, if the subscription is confirmed dead, cleaned up by
 * the caller (see lib/pushReminder.ts, which deletes on "gone").
 */
export async function trySendPush(subscription: PushSubscriptionKeys, payload: PushPayload): Promise<SendPushResult> {
  if (!pushEnabled) return "unconfigured";
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
    return "sent";
  } catch (err) {
    const statusCode = err instanceof webpush.WebPushError ? err.statusCode : undefined;
    if (statusCode === 404 || statusCode === 410) return "gone";
    console.error("[push] send failed, continuing anyway:", err);
    return "failed";
  }
}

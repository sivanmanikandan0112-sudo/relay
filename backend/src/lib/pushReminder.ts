import { prisma } from "./prisma.js";
import { dayKey } from "./date.js";
import { pushEnabled, trySendPush } from "./push.js";

export interface ReminderRunResult {
  skipped: boolean; // true when push isn't configured (VAPID keys unset) -- nothing to do
  eligibleAthletes: number; // athletes with >=1 subscription and no check-in today
  sent: number; // individual pushes that actually went out (one athlete can have multiple devices)
  pruned: number; // dead subscriptions deleted after a 404/410 from the push service
}

/**
 * Finds every athlete who (a) has at least one Web Push subscription and
 * (b) hasn't submitted today's check-in yet, and sends each of their
 * subscribed devices a reminder. Meant to be run once a day by a cron
 * job (see index.ts) -- accepts `now` as a parameter (defaulting to the
 * real clock) purely so tests can drive it deterministically without
 * faking Date globally, the same convention resolveSubmissionDay (lib/
 * date.ts) already uses.
 *
 * Coaches are never included -- this is specifically a "you haven't
 * checked in today" nudge, and only athletes submit check-ins. A coach
 * who subscribes (the toggle is athlete-only in the UI, but nothing
 * stops a coach account from POSTing the subscription directly) simply
 * never matches the WellnessEntry join below and never gets a reminder.
 *
 * Runs at a single fixed UTC hour with no per-athlete timezone
 * awareness -- the same simplification dayKey/resolveSubmissionDay
 * already make throughout this app (see their own comments). A more
 * precise "evening, in this athlete's own timezone" reminder would need
 * a timezone field this app doesn't track anywhere yet.
 */
export async function sendCheckinReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  if (!pushEnabled) return { skipped: true, eligibleAthletes: 0, sent: 0, pruned: 0 };

  const today = dayKey(now);
  const athletes = await prisma.athlete.findMany({
    where: {
      user: { pushSubscriptions: { some: {} } },
      wellnessEntries: { none: { day: today } },
    },
    select: {
      id: true,
      user: { select: { pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } } } },
    },
  });

  let sent = 0;
  let pruned = 0;
  for (const athlete of athletes) {
    for (const sub of athlete.user?.pushSubscriptions ?? []) {
      const result = await trySendPush(sub, {
        title: "Check-in reminder",
        body: "You haven't logged today's check-in yet -- takes less than a minute.",
        url: "/checkin",
      });
      if (result === "sent") sent++;
      if (result === "gone") {
        // The push service itself says this subscription no longer
        // exists (browser uninstalled, permission revoked, etc.) --
        // safe to delete outright rather than retrying it tomorrow.
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        pruned++;
      }
    }
  }

  return { skipped: false, eligibleAthletes: athletes.length, sent, pruned };
}

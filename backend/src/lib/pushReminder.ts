import { prisma } from "./prisma.js";
import { localDayKey, localHour } from "./date.js";
import { pushEnabled, trySendPush } from "./push.js";

export interface ReminderRunResult {
  skipped: boolean; // true when push isn't configured (VAPID keys unset) -- nothing to do
  eligibleAthletes: number; // athletes with >=1 subscription, no check-in today, and reminderHour matching this run
  sent: number; // individual pushes that actually went out (one athlete can have multiple devices)
  pruned: number; // dead subscriptions deleted after a 404/410 from the push service
}

// The schedule every athlete/coach effectively had before reminderHour
// existed -- still the fallback once neither an athlete nor any of their
// coaches has set a preference of their own.
export const DEFAULT_REMINDER_HOUR = 16; // 4pm

// Valid range for User.reminderHour -- hour-of-day, not a full clock time
// (no minutes), since a nudge that's "close enough" to a preferred hour
// doesn't need to-the-minute precision the way a submission timestamp does.
export const MIN_REMINDER_HOUR = 0;
export const MAX_REMINDER_HOUR = 23;

/**
 * The hour an athlete's reminder should actually fire at: their own
 * User.reminderHour if they've set one, else the earliest hour any of
 * their coaches has set (a school-shared roster can have several coaches
 * with different preferences -- picking the earliest means nobody's
 * reminder arrives *later* than a coach actually wanted, only ever
 * earlier), else DEFAULT_REMINDER_HOUR.
 */
export function effectiveReminderHour(athleteHour: number | null | undefined, coachHours: Array<number | null | undefined>): number {
  if (athleteHour != null) return athleteHour;
  const set = coachHours.filter((h): h is number => h != null);
  return set.length > 0 ? Math.min(...set) : DEFAULT_REMINDER_HOUR;
}

/**
 * Finds every athlete who (a) has at least one Web Push subscription,
 * (b) hasn't submitted today's check-in yet, and (c) has an effective
 * reminder hour (see effectiveReminderHour above) matching the hour this
 * is being run at -- and sends each of their subscribed devices a
 * reminder. Meant to be run once every hour by a cron job (see index.ts),
 * so each athlete/coach's own chosen hour actually gets hit once a day
 * rather than needing one cron job per distinct hour anyone's picked.
 * Accepts `now` as a parameter (defaulting to the real clock) purely so
 * tests can drive it deterministically without faking Date globally, the
 * same convention resolveSubmissionDay (lib/date.ts) already uses.
 *
 * This "hasn't checked in yet today" half of the query also backs the
 * coach-initiated per-athlete nudge (see routes/athletes.ts's POST
 * /:id/nudge) -- calling this more than once an hour, or in the same
 * hour as a manual nudge, is safe on its own, since anyone who's since
 * checked in simply won't match a second time.
 *
 * Coaches are never sent a reminder themselves -- this is specifically a
 * "you haven't checked in today" nudge, and only athletes submit
 * check-ins. A coach who subscribes (the toggle is athlete-only in the
 * UI, but nothing stops a coach account from POSTing the subscription
 * directly) simply never matches the WellnessEntry join below and never
 * gets one. A coach's own reminderHour is only ever read as a *fallback*
 * for their athletes, never used to remind the coach.
 *
 * Both the day and hour anchors here are America/Chicago, not raw server
 * UTC -- the same single-timezone assumption localDayKey/localHour's own
 * comments explain (this app doesn't track a per-user IANA timezone, so
 * "8pm" here means Central time for everyone, not each athlete's own
 * actual local evening).
 */
export async function sendCheckinReminders(now: Date = new Date()): Promise<ReminderRunResult> {
  if (!pushEnabled) return { skipped: true, eligibleAthletes: 0, sent: 0, pruned: 0 };

  // localDayKey, not dayKey -- WellnessEntry.day is the correctly-resolved
  // local calendar day a check-in belongs to (see resolveSubmissionDay),
  // so "today" here needs the same anchor or this reminder (and the
  // nudge route sharing this same check, see routes/athletes.ts) would
  // think an athlete who already checked in this evening still hasn't,
  // right during the same UTC-rollover window that originally motivated
  // this whole local-day fix.
  const today = localDayKey(now);
  const currentHour = localHour(now);

  const candidates = await prisma.athlete.findMany({
    where: {
      user: { pushSubscriptions: { some: {} } },
      wellnessEntries: { none: { day: today } },
    },
    select: {
      id: true,
      user: {
        select: {
          reminderHour: true,
          pushSubscriptions: { select: { id: true, endpoint: true, p256dh: true, auth: true } },
        },
      },
      coaches: { select: { coach: { select: { reminderHour: true } } } },
    },
  });

  const athletes = candidates.filter(
    (a) => effectiveReminderHour(a.user?.reminderHour, a.coaches.map((c) => c.coach.reminderHour)) === currentHour
  );

  let sent = 0;
  let pruned = 0;
  for (const athlete of athletes) {
    for (const sub of athlete.user?.pushSubscriptions ?? []) {
      const result = await trySendPush(sub, {
        title: "Check-in reminder",
        body: "You haven't logged today's check-in yet -- takes less than a minute. Ran today? Log that too.",
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

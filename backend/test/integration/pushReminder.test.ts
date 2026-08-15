import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAthlete, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";
import { dayKey } from "../../src/lib/date.js";

// Same mocking approach as pushSubscription.test.ts -- pushEnabled forced
// true (a real VAPID keypair can't exist in this test tier) and
// trySendPush replaced with a controllable mock, so this file can drive
// every branch of the selection/pruning logic (who's eligible, what
// happens on "sent" vs "gone" vs "failed") without a real push service.
vi.mock("../../src/lib/push.js", () => ({ pushEnabled: true, trySendPush: vi.fn() }));

import { trySendPush } from "../../src/lib/push.js";
import { sendCheckinReminders } from "../../src/lib/pushReminder.js";
const mockTrySendPush = vi.mocked(trySendPush);

beforeEach(async () => {
  await resetDb();
  mockTrySendPush.mockReset();
  mockTrySendPush.mockResolvedValue("sent");
});

async function subscribe(userId: string, endpoint: string) {
  return prisma.pushSubscription.create({ data: { userId, endpoint, p256dh: "p256dh", auth: "auth" } });
}

describe("sendCheckinReminders", () => {
  it("sends to a subscribed athlete who hasn't checked in today", async () => {
    const { user, athlete } = await createAthlete({ username: "ath.remind.due", firstName: "Due", lastName: "Athlete", squad: "GIRLS" });
    await subscribe(user!.id, "https://push.example.com/due");

    const result = await sendCheckinReminders();
    expect(result).toEqual({ skipped: false, eligibleAthletes: 1, sent: 1, pruned: 0 });
    expect(mockTrySendPush).toHaveBeenCalledTimes(1);
    const [, payload] = mockTrySendPush.mock.calls[0];
    expect(payload.url).toBe("/checkin");
    expect(athlete).toBeTruthy();
  });

  it("skips an athlete who already checked in today", async () => {
    const { user, athlete } = await createAthlete({ username: "ath.remind.done", firstName: "Done", lastName: "Athlete", squad: "GIRLS" });
    await subscribe(user!.id, "https://push.example.com/done");
    await prisma.wellnessEntry.create({
      data: { athleteId: athlete.id, day: dayKey(new Date()), sleep: 3, soreness: 3, mood: 3, energy: 3, motivation: 3 },
    });

    const result = await sendCheckinReminders();
    expect(result).toEqual({ skipped: false, eligibleAthletes: 0, sent: 0, pruned: 0 });
    expect(mockTrySendPush).not.toHaveBeenCalled();
  });

  it("skips an athlete with no push subscription at all", async () => {
    await createAthlete({ username: "ath.remind.nosub", firstName: "NoSub", lastName: "Athlete", squad: "GIRLS" });

    const result = await sendCheckinReminders();
    expect(result.eligibleAthletes).toBe(0);
    expect(mockTrySendPush).not.toHaveBeenCalled();
  });

  it("sends once per device for an athlete with multiple subscriptions", async () => {
    const { user } = await createAthlete({ username: "ath.remind.multi", firstName: "Multi", lastName: "Device", squad: "GIRLS" });
    await subscribe(user!.id, "https://push.example.com/phone");
    await subscribe(user!.id, "https://push.example.com/laptop");

    const result = await sendCheckinReminders();
    expect(result).toEqual({ skipped: false, eligibleAthletes: 1, sent: 2, pruned: 0 });
  });

  it("prunes a subscription the push service reports as gone (404/410), and doesn't count it as sent", async () => {
    const { user } = await createAthlete({ username: "ath.remind.gone", firstName: "Gone", lastName: "Athlete", squad: "GIRLS" });
    await subscribe(user!.id, "https://push.example.com/dead");
    mockTrySendPush.mockResolvedValueOnce("gone");

    const result = await sendCheckinReminders();
    expect(result).toEqual({ skipped: false, eligibleAthletes: 1, sent: 0, pruned: 1 });
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: "https://push.example.com/dead" } })).toBeNull();
  });

  it("a transient failure ('failed') is neither counted as sent nor pruned -- the subscription survives to retry tomorrow", async () => {
    const { user } = await createAthlete({ username: "ath.remind.fail", firstName: "Fail", lastName: "Athlete", squad: "GIRLS" });
    await subscribe(user!.id, "https://push.example.com/flaky");
    mockTrySendPush.mockResolvedValueOnce("failed");

    const result = await sendCheckinReminders();
    expect(result).toEqual({ skipped: false, eligibleAthletes: 1, sent: 0, pruned: 0 });
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: "https://push.example.com/flaky" } })).not.toBeNull();
  });

  it("never sends to a coach -- only athletes have check-ins to be reminded about", async () => {
    // A coach subscribing is possible (the endpoint isn't role-gated --
    // see pushSubscription.test.ts), but the reminder query only ever
    // joins through Athlete, so a coach's own subscription simply never
    // matches, with no special-casing needed in the query itself.
    const coach = await prisma.user.create({
      data: {
        username: "coach.remind.never",
        email: "coach.remind.never@test.relay",
        passwordHash: "x",
        firstName: "Coach",
        lastName: "Never",
        role: "COACH",
      },
    });
    await subscribe(coach.id, "https://push.example.com/coach-device");

    const result = await sendCheckinReminders();
    expect(result.eligibleAthletes).toBe(0);
    expect(mockTrySendPush).not.toHaveBeenCalled();
  });
});

// The "pushEnabled is false -> skip immediately" branch is covered
// separately in push.test.ts (unit tier), against the real, unmocked
// module -- no VAPID keys are set anywhere in this test tier, so that's
// genuinely exercising the same code path this file mocks around.

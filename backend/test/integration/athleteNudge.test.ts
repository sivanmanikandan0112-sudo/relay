import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { app, loginAs } from "./helpers.js";
import { assignRoster, createAthlete, createCoach, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";
import { localDayKey } from "../../src/lib/date.js";

// Same mocking approach as pushReminder.test.ts -- pushEnabled forced
// true (a real VAPID keypair can't exist in this test tier) and
// trySendPush replaced with a controllable mock.
vi.mock("../../src/lib/push.js", () => ({ pushEnabled: true, trySendPush: vi.fn() }));

import { trySendPush } from "../../src/lib/push.js";
const mockTrySendPush = vi.mocked(trySendPush);

beforeEach(async () => {
  await resetDb();
  mockTrySendPush.mockReset();
  mockTrySendPush.mockResolvedValue("sent");
});

async function subscribe(userId: string, endpoint: string) {
  return prisma.pushSubscription.create({ data: { userId, endpoint, p256dh: "p256dh", auth: "auth" } });
}

describe("POST /api/athletes/:id/nudge", () => {
  it("sends a push to a subscribed athlete who hasn't checked in today", async () => {
    const coach = await createCoach({ username: "coach.nudge.due", firstName: "Nudge", lastName: "Coach" });
    const { athlete, user } = await createAthlete({ username: "ath.nudge.due", firstName: "Due", lastName: "Athlete", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    await subscribe(user!.id, "https://push.example.com/nudge-due");

    const token = await loginAs("coach.nudge.due");
    const res = await request(app).post(`/api/athletes/${athlete.id}/nudge`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 1, pruned: 0 });
    expect(mockTrySendPush).toHaveBeenCalledTimes(1);
    const [, payload] = mockTrySendPush.mock.calls[0];
    expect(payload.url).toBe("/checkin");
  });

  it("400s if the athlete already checked in today", async () => {
    const coach = await createCoach({ username: "coach.nudge.done", firstName: "Nudge", lastName: "Coach" });
    const { athlete, user } = await createAthlete({ username: "ath.nudge.done", firstName: "Done", lastName: "Athlete", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    await subscribe(user!.id, "https://push.example.com/nudge-done");
    await prisma.wellnessEntry.create({
      data: { athleteId: athlete.id, day: localDayKey(new Date()), sleep: 3, soreness: 3, mood: 3, energy: 3, motivation: 3 },
    });

    const token = await loginAs("coach.nudge.done");
    const res = await request(app).post(`/api/athletes/${athlete.id}/nudge`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(mockTrySendPush).not.toHaveBeenCalled();
  });

  it("400s if the athlete has no push subscription on file", async () => {
    const coach = await createCoach({ username: "coach.nudge.nosub", firstName: "Nudge", lastName: "Coach" });
    const { athlete } = await createAthlete({ username: "ath.nudge.nosub", firstName: "NoSub", lastName: "Athlete", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);

    const token = await loginAs("coach.nudge.nosub");
    const res = await request(app).post(`/api/athletes/${athlete.id}/nudge`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(400);
    expect(mockTrySendPush).not.toHaveBeenCalled();
  });

  it("403s a coach who isn't on this athlete's roster", async () => {
    const owner = await createCoach({ username: "coach.nudge.owner", firstName: "Owner", lastName: "Coach" });
    await createCoach({ username: "coach.nudge.outsider", firstName: "Outsider", lastName: "Coach" });
    const { athlete, user } = await createAthlete({ username: "ath.nudge.outsider", firstName: "Ath", lastName: "Outsider", squad: "GIRLS" });
    await assignRoster(owner.id, athlete.id);
    await subscribe(user!.id, "https://push.example.com/nudge-outsider");

    const token = await loginAs("coach.nudge.outsider");
    const res = await request(app).post(`/api/athletes/${athlete.id}/nudge`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(403);
    expect(mockTrySendPush).not.toHaveBeenCalled();
  });

  it("prunes a subscription the push service reports as gone", async () => {
    const coach = await createCoach({ username: "coach.nudge.gone", firstName: "Nudge", lastName: "Coach" });
    const { athlete, user } = await createAthlete({ username: "ath.nudge.gone", firstName: "Gone", lastName: "Athlete", squad: "GIRLS" });
    await assignRoster(coach.id, athlete.id);
    await subscribe(user!.id, "https://push.example.com/nudge-gone");
    mockTrySendPush.mockResolvedValueOnce("gone");

    const token = await loginAs("coach.nudge.gone");
    const res = await request(app).post(`/api/athletes/${athlete.id}/nudge`).set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: 0, pruned: 1 });
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: "https://push.example.com/nudge-gone" } })).toBeNull();
  });
});

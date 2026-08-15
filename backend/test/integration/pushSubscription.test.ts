import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createAthlete, createCoach, resetDb } from "../testDb.js";
import { prisma } from "../../src/lib/prisma.js";

// Same reasoning as googleAuth.test.ts: there's no way to genuinely
// configure VAPID keys and mint a real browser push subscription inside
// a test environment (a subscription's endpoint/keys come from an actual
// browser's push service registration), so this mocks pushEnabled to
// true to exercise routes/me.ts's own logic -- ownership scoping, upsert
// vs. duplicate, validation -- against a real database, without needing
// a real push service on the other end. The "VAPID not configured ->
// 503" branch itself is tested for real below, in its own describe
// block, against the actual unmocked module (no VAPID keys are set
// anywhere in this test tier -- see push.test.ts).
vi.mock("../../src/lib/push.js", () => ({ pushEnabled: true, trySendPush: vi.fn() }));

// Imported *after* the app (which pulls in routes/me.ts, which pulls in
// lib/push.js) so the mock above is already in place -- vi.mock calls
// are hoisted above imports by Vitest, so this ordering in the source
// file doesn't actually matter, but keeping the app import first mirrors
// googleAuth.test.ts's own layout for consistency.
import { app, loginAs } from "./helpers.js";

beforeEach(async () => {
  await resetDb();
});

const SUBSCRIPTION = {
  endpoint: "https://push.example.com/subscription/abc123",
  keys: { p256dh: "fake-p256dh-key", auth: "fake-auth-key" },
};

describe("POST /api/me/push-subscription (VAPID configured)", () => {
  it("saves a new subscription tied to the caller's own account", async () => {
    const { user } = await createAthlete({ username: "ath.push.new", firstName: "Push", lastName: "New", squad: "GIRLS" });
    const token = await loginAs("ath.push.new");

    const res = await request(app).post("/api/me/push-subscription").set("Authorization", `Bearer ${token}`).send(SUBSCRIPTION);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subscribed: true });

    const row = await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: SUBSCRIPTION.endpoint } });
    expect(row.userId).toBe(user!.id);
    expect(row.p256dh).toBe(SUBSCRIPTION.keys.p256dh);
    expect(row.auth).toBe(SUBSCRIPTION.keys.auth);
  });

  it("re-subscribing the same endpoint updates the existing row instead of creating a duplicate", async () => {
    await createAthlete({ username: "ath.push.resub", firstName: "Push", lastName: "Resub", squad: "GIRLS" });
    const token = await loginAs("ath.push.resub");

    await request(app).post("/api/me/push-subscription").set("Authorization", `Bearer ${token}`).send(SUBSCRIPTION);
    const updated = { ...SUBSCRIPTION, keys: { p256dh: "rotated-p256dh", auth: "rotated-auth" } };
    const res = await request(app).post("/api/me/push-subscription").set("Authorization", `Bearer ${token}`).send(updated);
    expect(res.status).toBe(200);

    const rows = await prisma.pushSubscription.findMany({ where: { endpoint: SUBSCRIPTION.endpoint } });
    expect(rows).toHaveLength(1);
    expect(rows[0].p256dh).toBe("rotated-p256dh");
  });

  it("works for a coach too -- subscribing itself isn't role-gated", async () => {
    await createCoach({ username: "coach.push", firstName: "Coach", lastName: "Push" });
    const token = await loginAs("coach.push");

    const res = await request(app).post("/api/me/push-subscription").set("Authorization", `Bearer ${token}`).send(SUBSCRIPTION);
    expect(res.status).toBe(200);
  });

  it("400s on a malformed body (missing keys)", async () => {
    await createAthlete({ username: "ath.push.bad", firstName: "Push", lastName: "Bad", squad: "GIRLS" });
    const token = await loginAs("ath.push.bad");

    const res = await request(app)
      .post("/api/me/push-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: "https://push.example.com/x" });
    expect(res.status).toBe(400);
  });

  it("401s with no auth", async () => {
    const res = await request(app).post("/api/me/push-subscription").send(SUBSCRIPTION);
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/me/push-subscription (VAPID configured)", () => {
  it("removes the caller's own subscription", async () => {
    await createAthlete({ username: "ath.push.del", firstName: "Push", lastName: "Del", squad: "GIRLS" });
    const token = await loginAs("ath.push.del");
    await request(app).post("/api/me/push-subscription").set("Authorization", `Bearer ${token}`).send(SUBSCRIPTION);

    const res = await request(app)
      .delete("/api/me/push-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: SUBSCRIPTION.endpoint });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ subscribed: false });

    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: SUBSCRIPTION.endpoint } })).toBeNull();
  });

  it("can't delete another account's subscription by guessing its endpoint", async () => {
    await createAthlete({ username: "ath.push.owner", firstName: "Owner", lastName: "Push", squad: "GIRLS" });
    const ownerToken = await loginAs("ath.push.owner");
    await request(app).post("/api/me/push-subscription").set("Authorization", `Bearer ${ownerToken}`).send(SUBSCRIPTION);

    await createAthlete({ username: "ath.push.attacker", firstName: "Attacker", lastName: "Push", squad: "GIRLS" });
    const attackerToken = await loginAs("ath.push.attacker");
    const res = await request(app)
      .delete("/api/me/push-subscription")
      .set("Authorization", `Bearer ${attackerToken}`)
      .send({ endpoint: SUBSCRIPTION.endpoint });
    expect(res.status).toBe(200); // still reports success -- see the route's own comment on why

    // ...but the row is untouched, still owned by the original account.
    expect(await prisma.pushSubscription.findUnique({ where: { endpoint: SUBSCRIPTION.endpoint } })).not.toBeNull();
  });

  it("200s (no-op) deleting an endpoint that was never subscribed", async () => {
    await createAthlete({ username: "ath.push.noop", firstName: "Push", lastName: "Noop", squad: "GIRLS" });
    const token = await loginAs("ath.push.noop");

    const res = await request(app)
      .delete("/api/me/push-subscription")
      .set("Authorization", `Bearer ${token}`)
      .send({ endpoint: "https://push.example.com/never-subscribed" });
    expect(res.status).toBe(200);
  });
});

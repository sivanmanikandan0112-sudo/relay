import { describe, expect, it } from "vitest";

// No VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY is set anywhere in the unit-test
// environment (by design -- same convention as email.test.ts and
// RESEND_API_KEY), so importing push.ts here exercises exactly the
// "unconfigured" branch every dev/test run actually uses, without
// needing to mock the web-push SDK or register a real push subscription.
describe("push.ts with no VAPID keys set", () => {
  it("pushEnabled is false", async () => {
    const { pushEnabled } = await import("./push.js");
    expect(pushEnabled).toBe(false);
  });

  it("trySendPush resolves 'unconfigured' without throwing and without a network call", async () => {
    const { trySendPush } = await import("./push.js");
    const result = await trySendPush(
      { endpoint: "https://push.example.com/abc", p256dh: "fake-p256dh", auth: "fake-auth" },
      { title: "Test", body: "Test body" }
    );
    expect(result).toBe("unconfigured");
  });
});

describe("sendCheckinReminders with no VAPID keys set", () => {
  it("skips immediately (skipped: true) without ever touching the database", async () => {
    // No prisma call here would even work in this unit tier (no
    // DATABASE_URL is set for it -- see vitest.config.ts's own comment),
    // so this doubles as proof the early `if (!pushEnabled) return` in
    // pushReminder.ts really does short-circuit before any query runs.
    const { sendCheckinReminders } = await import("./pushReminder.js");
    await expect(sendCheckinReminders()).resolves.toEqual({ skipped: true, eligibleAthletes: 0, sent: 0, pruned: 0 });
  });
});

// A real send-failure (network error, or a 404/410 "gone" response from
// the push service) is untested here by design -- same reasoning as
// email.test.ts's own comment: neither test tier ever sets real VAPID
// keys, so trySendPush's try/catch and its 404/410 -> "gone" branch can
// never actually fire in any automated test. test/integration/
// pushReminder.test.ts covers the selection/pruning logic around it
// instead, with trySendPush itself mocked.

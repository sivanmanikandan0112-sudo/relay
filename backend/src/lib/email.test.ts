import { describe, expect, it } from "vitest";

// No RESEND_API_KEY is set anywhere in the unit-test environment (by
// design -- see vitest.config.ts and .env.example), so importing email.ts
// here exercises exactly the "simulated" branch every dev/test run
// actually uses, without needing to mock the Resend SDK or make a real
// network call.
describe("email.ts in simulated mode (no RESEND_API_KEY set)", () => {
  it("emailEnabled is false", async () => {
    const { emailEnabled } = await import("./email.js");
    expect(emailEnabled).toBe(false);
  });

  it("sendEmail resolves without throwing and without a network call", async () => {
    const { sendEmail } = await import("./email.js");
    await expect(sendEmail({ to: "athlete@example.com", subject: "Test", html: "<p>hi</p>" })).resolves.toBeUndefined();
  });

  it("trySendEmail resolves true in simulated mode, same as a real successful send would", async () => {
    const { trySendEmail } = await import("./email.js");
    await expect(trySendEmail({ to: "athlete@example.com", subject: "Test", html: "<p>hi</p>" })).resolves.toBe(true);
  });
});

// Neither this unit tier nor the integration tier ever sets
// RESEND_API_KEY (see resetDb/testDb.ts and this file's own top
// comment), so sendEmail can never actually fail in any automated test
// here -- trySendEmail's try/catch around a real failure is untested by
// design, the same way this codebase avoids mocking the Resend SDK
// itself (see googleAuth.test.ts for the one deliberate exception to
// that rule, and why). app.test.ts's global-error-handling tests cover
// the other half of the actual production fix -- the part that doesn't
// require a real send failure to exercise.

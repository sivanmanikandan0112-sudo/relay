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
});

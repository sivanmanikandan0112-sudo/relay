import { describe, expect, it } from "vitest";
import { DEFAULT_REMINDER_HOUR, effectiveReminderHour } from "./pushReminder.js";

describe("effectiveReminderHour", () => {
  it("uses the athlete's own hour when they've set one, ignoring any coach hours", () => {
    expect(effectiveReminderHour(9, [16, 20])).toBe(9);
  });

  it("falls back to the earliest coach hour when the athlete hasn't set one", () => {
    expect(effectiveReminderHour(null, [20, 9, 16])).toBe(9);
    expect(effectiveReminderHour(undefined, [20, 9, 16])).toBe(9);
  });

  it("ignores coaches who also haven't set an hour", () => {
    expect(effectiveReminderHour(null, [null, 9, undefined])).toBe(9);
  });

  it("falls back to DEFAULT_REMINDER_HOUR when nobody in the chain has set one", () => {
    expect(effectiveReminderHour(null, [])).toBe(DEFAULT_REMINDER_HOUR);
    expect(effectiveReminderHour(null, [null, undefined])).toBe(DEFAULT_REMINDER_HOUR);
  });

  it("treats hour 0 (midnight) as a real, set preference -- not falsy/unset", () => {
    // A plain `athleteHour || fallback` would have wrongly skipped 0 here.
    expect(effectiveReminderHour(0, [16])).toBe(0);
    expect(effectiveReminderHour(null, [0, 16])).toBe(0);
  });
});

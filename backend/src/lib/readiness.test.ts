import { describe, expect, it } from "vitest";
import { plainSignal, resolveStatus } from "./readiness.js";

describe("resolveStatus", () => {
  it("returns the score-driven band when there's no injury on file", () => {
    expect(resolveStatus("FRESH", false, false)).toBe("FRESH");
    expect(resolveStatus("EASE_BACK", false, false)).toBe("EASE_BACK");
    expect(resolveStatus("BACK_OFF", false, false)).toBe("BACK_OFF");
  });

  it("an active injury overrides the band, no matter how good the score looks", () => {
    expect(resolveStatus("FRESH", true, false)).toBe("INJURED");
    expect(resolveStatus("BACK_OFF", true, false)).toBe("INJURED");
  });

  it("a recovering injury overrides to RETURN_PROTOCOL when there's no active injury", () => {
    expect(resolveStatus("FRESH", false, true)).toBe("RETURN_PROTOCOL");
    expect(resolveStatus("BACK_OFF", false, true)).toBe("RETURN_PROTOCOL");
  });

  it("an active injury always wins over a recovering one, if somehow both are true", () => {
    expect(resolveStatus("FRESH", true, true)).toBe("INJURED");
  });
});

describe("plainSignal", () => {
  it("uses only the athlete's first name", () => {
    expect(plainSignal("Maya Okonkwo", "FRESH", 4.5)).toContain("Maya");
    expect(plainSignal("Maya Okonkwo", "FRESH", 4.5)).not.toContain("Okonkwo");
  });

  it("has a distinct message per status", () => {
    const messages = (["FRESH", "EASE_BACK", "BACK_OFF", "RETURN_PROTOCOL", "INJURED"] as const).map((status) =>
      plainSignal("Jamie Lee", status, 3.5)
    );
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("INJURED and RETURN_PROTOCOL messages don't depend on the wellness figure", () => {
    expect(plainSignal("Jamie Lee", "INJURED", 1)).toBe(plainSignal("Jamie Lee", "INJURED", 5));
    expect(plainSignal("Jamie Lee", "RETURN_PROTOCOL", 1)).toBe(plainSignal("Jamie Lee", "RETURN_PROTOCOL", 5));
  });

  it("a low wellness figure changes the FRESH/EASE_BACK/BACK_OFF wording", () => {
    const low = plainSignal("Jamie Lee", "BACK_OFF", 2.0);
    const high = plainSignal("Jamie Lee", "BACK_OFF", 4.5);
    expect(low).not.toBe(high);
  });
});

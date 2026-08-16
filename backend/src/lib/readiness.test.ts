import { describe, expect, it } from "vitest";
import { plainSignal, resolveStatus, type SignalBreakdown } from "./readiness.js";

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

// No signal at all -- every z null, or all zero. Used as the baseline
// "nothing in particular is elevated" fixture below.
const NO_SIGNAL: SignalBreakdown = { zLoad: null, zEffortCost: null, zWellDaily: null };

describe("plainSignal", () => {
  it("uses only the athlete's first name", () => {
    expect(plainSignal("Maya Okonkwo", "FRESH", NO_SIGNAL, 4.5)).toContain("Maya");
    expect(plainSignal("Maya Okonkwo", "FRESH", NO_SIGNAL, 4.5)).not.toContain("Okonkwo");
  });

  it("has a distinct message per status", () => {
    const messages = (["FRESH", "EASE_BACK", "BACK_OFF", "RETURN_PROTOCOL", "INJURED"] as const).map((status) =>
      plainSignal("Jamie Lee", status, NO_SIGNAL, 3.5)
    );
    expect(new Set(messages).size).toBe(messages.length);
  });

  it("INJURED and RETURN_PROTOCOL messages don't depend on the wellness figure or signal breakdown", () => {
    const loadDriven: SignalBreakdown = { zLoad: 3, zEffortCost: null, zWellDaily: null };
    expect(plainSignal("Jamie Lee", "INJURED", NO_SIGNAL, 1)).toBe(plainSignal("Jamie Lee", "INJURED", loadDriven, 5));
    expect(plainSignal("Jamie Lee", "RETURN_PROTOCOL", NO_SIGNAL, 1)).toBe(plainSignal("Jamie Lee", "RETURN_PROTOCOL", loadDriven, 5));
  });

  it("a low wellness figure changes the FRESH/EASE_BACK/BACK_OFF wording", () => {
    const low = plainSignal("Jamie Lee", "BACK_OFF", NO_SIGNAL, 2.0);
    const high = plainSignal("Jamie Lee", "BACK_OFF", NO_SIGNAL, 4.5);
    expect(low).not.toBe(high);
  });

  // The actual point of this session's fix: two athletes in the same
  // status should get different explanations when different signals are
  // actually driving their flag -- not one fixed sentence per status.
  describe("driving-signal selection", () => {
    it("names load when load's weighted contribution clearly leads (this was Maya Chen's real case)", () => {
      // COMPOSITE_WEIGHTS = { load: 0.42, effortCost: 0.32, wellDaily: 0.26 }.
      // zLoad=1.92, zEffortCost=0, zWellDaily=1.55 -> load contributes
      // 0.42*1.92=0.807, wellDaily contributes 0.26*1.55=0.403 -- load
      // clearly leads, even though wellDaily's raw z was numerically
      // close to load's.
      const signals: SignalBreakdown = { zLoad: 1.92, zEffortCost: 0, zWellDaily: 1.55 };
      const msg = plainSignal("Maya Chen", "BACK_OFF", signals, 2.6);
      expect(msg).toContain("training load has climbed");
      expect(msg).not.toContain("easy runs are costing");
    });

    it("names effort cost when it clearly leads", () => {
      const signals: SignalBreakdown = { zLoad: 0.2, zEffortCost: 3, zWellDaily: 0.1 };
      const msg = plainSignal("Jamie Lee", "BACK_OFF", signals, 4);
      expect(msg).toContain("easy runs are costing more effort");
    });

    it("names wellness when it clearly leads, and skips the redundant secondary mood clause", () => {
      const signals: SignalBreakdown = { zLoad: 0.1, zEffortCost: 0.1, zWellDaily: 3 };
      const msg = plainSignal("Jamie Lee", "EASE_BACK", signals, 2.0);
      expect(msg).toContain("check-ins show a real dip");
      // Would otherwise trigger the low-wellnessAvg mood clause too --
      // confirming it's suppressed, not just absent by coincidence.
      expect(msg).not.toContain("mood and energy have dipped");
    });

    it("falls back to a multi-signal message when no single factor clearly leads", () => {
      // load contributes 0.42*1=0.42, wellDaily contributes 0.26*1.6=0.416
      // -- within 20% of each other, not a real standout either way.
      const signals: SignalBreakdown = { zLoad: 1, zEffortCost: null, zWellDaily: 1.6 };
      const msg = plainSignal("Jamie Lee", "BACK_OFF", signals, 4);
      expect(msg).toContain("drifting from their normal on more than one front");
    });

    it("never names a signal that's pulling risk DOWN (a negative contribution), even if its magnitude is largest", () => {
      // zLoad is strongly negative (well below normal load -- a good
      // thing), zWellDaily is mildly positive -- wellDaily should be
      // named, not load, even though |zLoad| > |zWellDaily|.
      const signals: SignalBreakdown = { zLoad: -3, zEffortCost: 0, zWellDaily: 1 };
      const msg = plainSignal("Jamie Lee", "EASE_BACK", signals, 4);
      expect(msg).toContain("check-ins show a real dip");
    });

    it("treats a null z-score (not enough baseline samples yet) as no contribution, not an error", () => {
      const signals: SignalBreakdown = { zLoad: 2, zEffortCost: null, zWellDaily: null };
      expect(() => plainSignal("Jamie Lee", "BACK_OFF", signals, 4)).not.toThrow();
      expect(plainSignal("Jamie Lee", "BACK_OFF", signals, 4)).toContain("training load has climbed");
    });
  });
});

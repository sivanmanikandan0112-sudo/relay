import { describe, expect, it } from "vitest";
import {
  ACUTE_LAMBDA,
  CHRONIC_LAMBDA,
  COMPOSITE_WEIGHTS,
  acwr,
  bandForReadiness,
  composite,
  effortCost,
  ewmaLambda,
  ewmaSeries,
  isEasyRun,
  logisticRisk,
  mean,
  readinessFromRisk,
  stddev,
  wellDaily,
  zLoad,
  zScore,
} from "./math.js";

// Every test below checks the code against a worked example transcribed
// straight from the handwritten notes in proofs/ (see
// docs/math-behind-relay.md for the section each one maps to), so a
// regression here means the implementation has drifted from the derivation
// it's supposed to match -- not just "a number changed".

describe("§4 EWMA", () => {
  it("λ = 2/(N+1) for the acute (7d) and chronic (28d) windows", () => {
    expect(ewmaLambda(7)).toBeCloseTo(0.25, 10);
    expect(ewmaLambda(28)).toBeCloseTo(0.0689655, 6);
    expect(ACUTE_LAMBDA).toBeCloseTo(0.25, 10);
    expect(CHRONIC_LAMBDA).toBeCloseTo(0.0689655, 6);
  });

  it("recursion EWMA_today = λ·L_today + (1-λ)·EWMA_yesterday, applied day by day", () => {
    // A single day's load, starting from an implicit EWMA of 0, is just λ·L.
    expect(ewmaSeries([100], 0.25)).toBeCloseTo(25, 10);
    // Two days: EWMA1 = 0.25*100 = 25; EWMA2 = 0.25*0 + 0.75*25 = 18.75.
    expect(ewmaSeries([100, 0], 0.25)).toBeCloseTo(18.75, 10);
    // A flat, constant daily load should converge to that same load.
    const flat = new Array(60).fill(50);
    expect(ewmaSeries(flat, 0.25)).toBeCloseTo(50, 4);
  });

  it("acute EWMA reacts to a new session faster than chronic, given the same spike", () => {
    const days = new Array(30).fill(20);
    days[days.length - 1] = 200; // a big spike today
    const acute = ewmaSeries(days, ACUTE_LAMBDA);
    const chronic = ewmaSeries(days, CHRONIC_LAMBDA);
    expect(acute).toBeGreaterThan(chronic);
  });
});

describe("§3 acute:chronic workload ratio", () => {
  it("acute / chronic", () => {
    expect(acwr(50, 40)).toBeCloseTo(1.25, 10);
  });

  it("reads as neutral (1.0) rather than dividing by zero when there's no chronic load yet", () => {
    expect(acwr(0, 0)).toBe(1);
    expect(acwr(40, 0)).toBe(1);
  });
});

describe("§6 general z-score framework", () => {
  it("mean and population standard deviation", () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3);
    // population variance of [1,2,3,4,5] is 2, so sigma = sqrt(2)
    expect(stddev([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2), 10);
  });

  it("z = (recent - mean) / sd against a baseline that excludes the recent point", () => {
    const baseline = [57, 60, 63, 60]; // mean 60, population sd 2.121...
    const sd = stddev(baseline);
    expect(zScore(60 + sd, baseline)).toBeCloseTo(1, 6);
  });

  it("returns null rather than a wild number when the baseline is too small to trust", () => {
    expect(zScore(10, [1, 2, 3])).toBeNull();
  });

  it("returns 0, not NaN, against a perfectly flat (zero-variance) baseline", () => {
    expect(zScore(5, [5, 5, 5, 5])).toBe(0);
  });
});

describe("§6.1 effort cost / efficiency", () => {
  it("(duration / distance) / RPE, worked example: μ=60, σ=3, recent=66 -> z=+2", () => {
    // Constructed so the baseline's own mean/sd are exactly 60 and 3.
    const baseline = [57, 63, 57, 63];
    expect(mean(baseline)).toBeCloseTo(60, 10);
    expect(stddev(baseline)).toBeCloseTo(3, 10);
    const recent = 66;
    expect(zScore(recent, baseline)).toBeCloseTo(2, 6);
  });

  it("computes effort cost as pace normalized by RPE", () => {
    // 30 min over 5 miles at RPE 3 -> (30/5)/3 = 2
    expect(effortCost(30, 5, 3)).toBeCloseTo(2, 10);
  });

  it("only counts easy/steady runs (RPE at or below the easy threshold) with a distance on file", () => {
    expect(isEasyRun(4, 5)).toBe(true);
    expect(isEasyRun(8, 5)).toBe(false); // too hard to be "easy" -- e.g. a tempo run
    expect(isEasyRun(3, null)).toBe(false); // no distance, can't compute pace
    expect(isEasyRun(3, 0)).toBe(false);
  });
});

describe("§6.2 wellness", () => {
  it("well_daily = (sleep+mood+energy+motivation+(6-soreness)) / 5", () => {
    expect(wellDaily({ sleep: 5, mood: 5, energy: 5, motivation: 5, soreness: 1 })).toBeCloseTo(5, 10);
    expect(wellDaily({ sleep: 1, mood: 1, energy: 1, motivation: 1, soreness: 5 })).toBeCloseTo(1, 10);
  });

  it("a wellness drop should read as a worse (positive) z, opposite sign from the general form", () => {
    const baseline = [4, 4.5, 4, 4.5]; // mean 4.25
    const droppedToday = 3.0; // below normal -- should be a *positive* z once flipped
    const raw = zScore(droppedToday, baseline)!;
    expect(raw).toBeLessThan(0); // the raw form reads a drop as negative
    expect(-raw).toBeGreaterThan(0); // flipping the sign is what the wellness z-score does
  });
});

describe("§6.3 standardized load (z_load)", () => {
  it("z_load = (ACWR - 1.0) / σ_ACWR, worked examples: ACWR=1.18 -> z=+1.0, ACWR=1.42 -> z=+2.33", () => {
    expect(zLoad(1.18, 0.18)).toBeCloseTo(1.0, 6);
    expect(zLoad(1.42, 0.18)).toBeCloseTo(2.333, 2);
  });

  it("ACWR = 1.0 (recent load exactly matches adaptation) is neutral -- z = 0", () => {
    expect(zLoad(1.0, 0.18)).toBe(0);
  });

  it("is centered on a fixed 1.0, not on whatever the athlete's own average ACWR is", () => {
    // A chronically over-ramped athlete (avg ACWR 1.3) should NOT read as
    // neutral just because 1.3 is "their normal" -- it should still read
    // as elevated risk against the fixed anchor.
    expect(zLoad(1.3, 0.18)).toBeGreaterThan(0);
  });
});

describe("§7 weighted composite", () => {
  it("C = 0.42*z_load + 0.32*z_effortcost + 0.26*z_welldaily, worked example -> C≈2.01", () => {
    const C = composite(2.33, 2.0, 1.5);
    expect(C).toBeCloseTo(2.01, 2);
  });

  it("a null z-score (not enough history for that metric) contributes 0, not average", () => {
    const withAllThree = composite(1, 1, 1);
    const withOneMissing = composite(1, 1, null);
    expect(withOneMissing).toBeLessThan(withAllThree);
    expect(withOneMissing).toBeCloseTo(0.42 * 1 + 0.32 * 1 + 0.26 * 0, 10);
  });

  it("the provisional weights are non-negative and sum to 1.0", () => {
    expect(COMPOSITE_WEIGHTS.load).toBeGreaterThanOrEqual(0);
    expect(COMPOSITE_WEIGHTS.effortCost).toBeGreaterThanOrEqual(0);
    expect(COMPOSITE_WEIGHTS.wellDaily).toBeGreaterThanOrEqual(0);
    expect(COMPOSITE_WEIGHTS.load + COMPOSITE_WEIGHTS.effortCost + COMPOSITE_WEIGHTS.wellDaily).toBeCloseTo(1.0, 10);
  });
});

describe("§8 logistic transform", () => {
  it("R = 100/(1+e^(-k(C-C0))), worked example: C=2.01, k=1.15, C0=0.35 -> R≈87", () => {
    const R = logisticRisk(2.01, 1.15, 0.35);
    expect(Math.round(R)).toBe(87);
  });

  it("stays within [0, 100] and saturates near the extremes, for any realistic composite score", () => {
    expect(logisticRisk(-100)).toBeGreaterThan(0);
    expect(logisticRisk(-100)).toBeLessThan(1);
    expect(logisticRisk(100)).toBeGreaterThan(99);
    expect(logisticRisk(100)).toBeLessThanOrEqual(100);
  });

  it("R = 50 exactly when C = C0, the midpoint of the S-curve", () => {
    expect(logisticRisk(0.35, 1.15, 0.35)).toBeCloseTo(50, 10);
  });

  it("readiness is the inverse of R, so a risk of 87 reads as a readiness of 13", () => {
    expect(readinessFromRisk(87)).toBe(13);
  });
});

describe("§9 status bands", () => {
  it("R>=70 (readiness<=30) is Back off", () => {
    expect(bandForReadiness(30)).toBe("BACK_OFF");
    expect(bandForReadiness(0)).toBe("BACK_OFF");
  });

  it("45<=R<=70 (30<readiness<=55) is Ease back", () => {
    expect(bandForReadiness(31)).toBe("EASE_BACK");
    expect(bandForReadiness(55)).toBe("EASE_BACK");
  });

  it("R<=45 (readiness>55) is Fresh", () => {
    expect(bandForReadiness(56)).toBe("FRESH");
    expect(bandForReadiness(100)).toBe("FRESH");
  });

  it("a readiness of 87 (the worked example, R≈13 after the flip) reads as Fresh", () => {
    expect(bandForReadiness(readinessFromRisk(13))).toBe("FRESH");
  });
});

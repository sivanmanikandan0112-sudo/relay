// Pure, side-effect-free implementations of every formula in
// docs/math-behind-relay.md. Nothing in this file touches Prisma or the
// database -- everything here takes plain numbers/arrays in and returns
// plain numbers out, specifically so it can be unit-tested directly
// against the notes' own worked examples (see math.test.ts) without a
// database. backend/src/lib/scoring.ts is the DB-touching layer that
// fetches an athlete's real data and feeds it through these functions.

// ---------------------------------------------------------------------
// §4 -- EWMA (exponentially weighted moving average)
// ---------------------------------------------------------------------

export const ACUTE_WINDOW_DAYS = 7;
export const CHRONIC_WINDOW_DAYS = 28;

/** λ = 2 / (N + 1), the standard EWMA smoothing constant for an N-day window. */
export function ewmaLambda(windowDays: number): number {
  return 2 / (windowDays + 1);
}

export const ACUTE_LAMBDA = ewmaLambda(ACUTE_WINDOW_DAYS); // 0.25
export const CHRONIC_LAMBDA = ewmaLambda(CHRONIC_WINDOW_DAYS); // ~0.0690

/**
 * Runs the recursion EWMA_today = λ·L_today + (1-λ)·EWMA_yesterday across a
 * sequence of daily loads (oldest first, one entry per calendar day, 0 on
 * rest days) and returns the final value. Starts from an implicit EWMA of 0
 * before the series begins, so a long-enough series (see CHRONIC_LOOKBACK_DAYS
 * in scoring.ts) is effectively fully converged by the time it reaches "today".
 */
export function ewmaSeries(dailyLoads: number[], lambda: number): number {
  let ewma = 0;
  for (const load of dailyLoads) {
    ewma = lambda * load + (1 - lambda) * ewma;
  }
  return ewma;
}

// ---------------------------------------------------------------------
// §3 -- acute:chronic workload ratio
// ---------------------------------------------------------------------

/** acute / chronic. With no chronic load on file yet, there's nothing to compare against, so read as neutral (1.0) rather than dividing by zero. */
export function acwr(acuteLoad: number, chronicLoad: number): number {
  if (chronicLoad <= 0) return 1;
  return acuteLoad / chronicLoad;
}

// ---------------------------------------------------------------------
// §6 -- general z-score framework
// ---------------------------------------------------------------------

/** Population mean: μ = (1/n) Σ xᵢ */
export function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  return xs.reduce((sum, x) => sum + x, 0) / xs.length;
}

/** Population standard deviation: σ = √[(1/n) Σ (xᵢ-μ)²] */
export function stddev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = mean(xs);
  const variance = xs.reduce((sum, x) => sum + (x - m) ** 2, 0) / xs.length;
  return Math.sqrt(variance);
}

/** Minimum number of *prior* observations needed before a personal baseline's σ is trusted at all -- below this, a z-score is statistical noise. */
export const MIN_BASELINE_SAMPLES = 4;

/**
 * z = (recent - μ) / σ, where μ/σ come from `baseline` (the athlete's own
 * prior history -- recent should NOT be included in it, so a new value is
 * judged against where it's *coming from*, not partly against itself).
 * Returns null -- "no signal yet", not "z=0 is good" -- when there isn't
 * enough baseline history to trust σ.
 */
export function zScore(recent: number, baseline: number[]): number | null {
  if (baseline.length < MIN_BASELINE_SAMPLES) return null;
  const sd = stddev(baseline);
  if (sd === 0) return 0; // perfectly consistent baseline -> no measurable deviation
  return (recent - mean(baseline)) / sd;
}

// ---------------------------------------------------------------------
// §6.1 -- effort cost / efficiency
// ---------------------------------------------------------------------

/** RPE at/below this stands in for "easy/steady" -- the only runs the notes say are meaningful for pace-vs-effort tracking (unlike tempo/intervals, where a rising pace is the point). */
export const EASY_RPE_THRESHOLD = 5;

export function isEasyRun(rpe: number, distanceMiles: number | null | undefined): boolean {
  return rpe <= EASY_RPE_THRESHOLD && distanceMiles != null && distanceMiles > 0;
}

/** effort cost = (duration / distance) / RPE -- pace normalized by how hard it felt. */
export function effortCost(durationMin: number, distanceMiles: number, rpe: number): number {
  return durationMin / distanceMiles / rpe;
}

// ---------------------------------------------------------------------
// §6.2 -- wellness
// ---------------------------------------------------------------------

export interface WellnessInput {
  sleep: number;
  mood: number;
  energy: number;
  motivation: number;
  soreness: number;
}

/** well_daily = (sleep+mood+energy+motivation+(6-soreness)) / 5 -- soreness inverted first so higher is always better across all five inputs. */
export function wellDaily(entry: WellnessInput): number {
  return (entry.sleep + entry.mood + entry.energy + entry.motivation + (6 - entry.soreness)) / 5;
}

// ---------------------------------------------------------------------
// §6.3 -- standardized load
// ---------------------------------------------------------------------

/** Provisional σ_ACWR -- published endurance-athlete ACWR distributions cluster ~0.15-0.25; not yet fit from this squad's own season data. */
export const SIGMA_ACWR = 0.18;

/** z_load = (ACWR - 1.0) / σ_ACWR -- centered on a fixed neutral point (ACWR=1.0, "this week matches what the body's adapted to"), not a personal mean; see docs/math-behind-relay.md §6. */
export function zLoad(acwrValue: number, sigmaAcwr: number = SIGMA_ACWR): number {
  return (acwrValue - 1.0) / sigmaAcwr;
}

// ---------------------------------------------------------------------
// §7 -- weighted composite
// ---------------------------------------------------------------------

export interface CompositeWeights {
  load: number;
  effortCost: number;
  wellDaily: number;
}

/** Provisional weights: load weighted most (drives overuse injury most directly, but capped under 0.5 so it alone can't dominate), wellness weighted least (self-reported, easiest to misstate). Sums to 1.0. */
export const COMPOSITE_WEIGHTS: CompositeWeights = { load: 0.42, effortCost: 0.32, wellDaily: 0.26 };

/**
 * C = w_load·z_load + w_effortcost·z_effortcost + w_welldaily·z_welldaily.
 * A null z (not enough history for that one metric yet) contributes 0 --
 * "no signal", not "assume average" -- rather than dropping out of the sum
 * and silently reweighting the other two.
 */
export function composite(
  zLoadValue: number | null,
  zEffortCostValue: number | null,
  zWellDailyValue: number | null,
  weights: CompositeWeights = COMPOSITE_WEIGHTS
): number {
  return (
    weights.load * (zLoadValue ?? 0) +
    weights.effortCost * (zEffortCostValue ?? 0) +
    weights.wellDaily * (zWellDailyValue ?? 0)
  );
}

// ---------------------------------------------------------------------
// §8 -- logistic transform
// ---------------------------------------------------------------------

export const LOGISTIC_K = 1.15;
export const LOGISTIC_C0 = 0.35;

/** R = 100 / (1 + e^(-k(C-C0))) -- bounded 0-100 risk score, S-shaped around C0 (most sensitive there, flattening at the extremes). */
export function logisticRisk(C: number, k: number = LOGISTIC_K, c0: number = LOGISTIC_C0): number {
  return 100 / (1 + Math.exp(-k * (C - c0)));
}

/** readiness = 100 - R, so a high number reads as good (matching "Fresh"), the opposite sense of R. */
export function readinessFromRisk(R: number): number {
  return 100 - R;
}

// ---------------------------------------------------------------------
// §9 -- status bands and the minimum-history gate
// ---------------------------------------------------------------------

/** R>=70 (readiness<=30) "Back off"; 45<=R<=70 (30<readiness<=55) "Ease back"; R<=45 (readiness>55) "Fresh". */
export function bandForReadiness(readiness: number): "FRESH" | "EASE_BACK" | "BACK_OFF" {
  if (readiness <= 30) return "BACK_OFF";
  if (readiness <= 55) return "EASE_BACK";
  return "FRESH";
}

/** ~2-3 weeks, per the notes, before an athlete's own μ/σ (and therefore the whole z-score pipeline) is trustworthy at all. */
export const MIN_HISTORY_DAYS = 14;

// ---------------------------------------------------------------------
// §2 -- Riemann-sum daily load accumulation
// ---------------------------------------------------------------------

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Buckets loads into one load-total per calendar day, oldest first, from
 * `start` through `now` inclusive (days with no logged run count as 0) --
 * the Riemann-sum framing from docs/math-behind-relay.md §2, in a shape
 * the EWMA recursion in §4 can walk day by day.
 */
export function buildDailySeries(loads: { date: Date; load: number }[], start: Date, now: Date): number[] {
  const dayCount = Math.floor((startOfDay(now).getTime() - startOfDay(start).getTime()) / 86400000) + 1;
  const totals = new Array(Math.max(dayCount, 0)).fill(0);
  for (const l of loads) {
    const idx = Math.floor((startOfDay(l.date).getTime() - startOfDay(start).getTime()) / 86400000);
    if (idx >= 0 && idx < totals.length) totals[idx] += l.load;
  }
  return totals;
}

// ---------------------------------------------------------------------
// §9 -- injury baseline exclusion
// ---------------------------------------------------------------------

export interface ExclusionRange {
  start: Date;
  end: Date;
}

/**
 * Date ranges an athlete's own baseline (mu/sigma) shouldn't be built from:
 * an ongoing active injury (open-ended, through `now`) or a past, now-closed
 * injury (its recorded start/end). A *recovering* (return-to-run) period is
 * deliberately NOT excluded -- that data still counts toward the rolling
 * baseline, per docs/math-behind-relay.md §9; only the status display is
 * overridden for it, in resolveStatus.
 */
export function baselineExclusionRanges(
  injuries: { status: string; startDate: Date; endDate: Date | null }[],
  now: Date
): ExclusionRange[] {
  return injuries
    .filter((i) => i.status === "ACTIVE" || i.status === "RESOLVED")
    .map((i) => ({ start: i.startDate, end: i.status === "ACTIVE" ? now : (i.endDate ?? now) }));
}

export function isExcluded(date: Date, ranges: ExclusionRange[]): boolean {
  return ranges.some((r) => date >= r.start && date <= r.end);
}

// ---------------------------------------------------------------------
// Calendar -- ISO week numbering
// ---------------------------------------------------------------------

/**
 * ISO-8601 week number and week-year for a date (weeks run Mon-Sun; the
 * week containing a year's first Thursday is week 1). Used to key
 * ReadinessScore rows so "this week" is unambiguous across a year
 * boundary.
 */
export function currentIsoWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

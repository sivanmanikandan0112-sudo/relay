import type { ReadinessStatus } from "@prisma/client";
import { prisma } from "./prisma.js";
import { plainSignal, resolveStatus } from "./readiness.js";
import {
  ACUTE_LAMBDA,
  CHRONIC_LAMBDA,
  CHRONIC_WINDOW_DAYS,
  MIN_HISTORY_DAYS,
  acwr,
  bandForReadiness,
  baselineExclusionRanges,
  buildDailySeries,
  composite,
  currentIsoWeek,
  effortCost,
  ewmaSeries,
  isEasyRun,
  isExcluded,
  logisticRisk,
  readinessFromRisk,
  wellDaily,
  zLoad,
  zScore,
} from "./math.js";

// How far back we fetch raw rows from the database. LOAD_LOOKBACK_DAYS is
// generous enough that the chronic EWMA (lambda ~= 0.069) is fully
// converged by "today" -- after 90 days the weight left on day 1 is under
// 0.3%. STATS_LOOKBACK_DAYS matches the notes' own "mean and standard
// deviation over 28 days" for the effort-cost/wellness baselines.
const LOAD_LOOKBACK_DAYS = 90;
const STATS_LOOKBACK_DAYS = CHRONIC_WINDOW_DAYS; // 28

/**
 * Every intermediate number the pipeline in docs/math-behind-relay.md
 * produces on the way to a final score, not just the final score -- so it
 * can be inspected (see scripts/inspect-athlete.ts) instead of only ever
 * being visible as one collapsed 0-100 number in the database.
 */
export interface ReadinessBreakdown {
  athleteId: string;
  athleteName: string;
  now: Date;
  daysOfHistory: number;
  hasEnoughHistory: boolean;
  acuteLoad: number;
  chronicLoad: number;
  acwr: number;
  zLoad: number | null;
  effortCostRecent: number | null;
  effortCostBaselineSize: number;
  zEffortCost: number | null;
  wellDailyRecent: number | null;
  wellDailyBaselineSize: number;
  zWellDaily: number | null;
  composite: number;
  risk: number; // R, from the logistic transform
  readiness: number; // 100 - R, unrounded
  score: number; // readiness, rounded and clamped -- what actually gets stored
  band: "FRESH" | "EASE_BACK" | "BACK_OFF";
  status: ReadinessStatus;
  summary: string;
  activeInjury: boolean;
  recoveringInjury: boolean;
}

/**
 * Runs the full pipeline from docs/math-behind-relay.md against an
 * athlete's real data and returns every intermediate value, without
 * writing anything to the database. `recomputeReadiness` below is a thin
 * wrapper that calls this and persists the result; scripts/inspect-athlete.ts
 * calls this directly to print the breakdown for manual testing.
 */
export async function computeReadinessBreakdown(athleteId: string, now: Date = new Date()): Promise<ReadinessBreakdown> {
  const athlete = await prisma.athlete.findUniqueOrThrow({ where: { id: athleteId } });

  const loadLookbackStart = new Date(now.getTime() - LOAD_LOOKBACK_DAYS * 86400000);
  const statsLookbackStart = new Date(now.getTime() - STATS_LOOKBACK_DAYS * 86400000);

  const [loadHistory, wellnessHistory, injuries] = await Promise.all([
    prisma.trainingLoad.findMany({
      where: { athleteId, date: { gte: loadLookbackStart, lte: now } },
      orderBy: { date: "asc" },
    }),
    prisma.wellnessEntry.findMany({
      where: { athleteId, date: { gte: statsLookbackStart, lte: now } },
      orderBy: { date: "asc" },
    }),
    // All injuries regardless of status: a RESOLVED one still defines a
    // past exclusion window for the baseline (see baselineExclusionRanges),
    // and startDate <= now matters when recomputing a *past* week (seeding
    // history, backfills) so an injury can't override weeks before it
    // actually started.
    prisma.injury.findMany({ where: { athleteId, startDate: { lte: now } }, orderBy: { startDate: "desc" } }),
  ]);

  const activeInjury = injuries.some((i) => i.status === "ACTIVE");
  const recoveringInjury = injuries.some((i) => i.status === "RECOVERING");
  const exclusions = baselineExclusionRanges(injuries, now);

  // §3-4: acute/chronic load as an EWMA over the full lookback series, not
  // a plain windowed average -- see math.ts's ewmaSeries.
  const dailyLoads = buildDailySeries(loadHistory, loadLookbackStart, now);
  const acuteLoad = ewmaSeries(dailyLoads, ACUTE_LAMBDA);
  const chronicLoad = ewmaSeries(dailyLoads, CHRONIC_LAMBDA);
  const acwrValue = acwr(acuteLoad, chronicLoad);

  // §6.1: effort cost, easy/steady runs only, athlete's own trailing
  // 28-day history, with any injured-period days excluded so they don't
  // corrupt the baseline.
  const effortCostSeries = loadHistory
    .filter((l) => l.date >= statsLookbackStart && isEasyRun(l.rpe, l.distanceMiles) && !isExcluded(l.date, exclusions))
    .map((l) => effortCost(l.durationMin, l.distanceMiles!, l.rpe));
  const recentEffortCost = effortCostSeries.length > 0 ? effortCostSeries[effortCostSeries.length - 1] : null;
  const effortCostBaseline = effortCostSeries.slice(0, -1);

  // §6.2: wellness, same treatment -- most recent check-in vs. the
  // athlete's own trailing baseline, injured days excluded.
  const wellDailySeries = wellnessHistory.filter((w) => !isExcluded(w.date, exclusions)).map((w) => wellDaily(w));
  const recentWellDaily = wellDailySeries.length > 0 ? wellDailySeries[wellDailySeries.length - 1] : null;
  const wellDailyBaseline = wellDailySeries.slice(0, -1);

  // §9: need ~2-3 weeks of *some* data before trusting any of the above --
  // otherwise mu/sigma are meaningless. Below that, every z-score reads as
  // "no signal" (null -> contributes 0 to the composite) regardless of how
  // the individual per-metric sample-size checks inside zScore would have
  // come out on their own.
  const firstEverDate = [...loadHistory.map((l) => l.date), ...wellnessHistory.map((w) => w.date)].reduce<Date | null>(
    (earliest, d) => (earliest === null || d < earliest ? d : earliest),
    null
  );
  const daysOfHistory = firstEverDate ? (now.getTime() - firstEverDate.getTime()) / 86400000 : 0;
  const hasEnoughHistory = daysOfHistory >= MIN_HISTORY_DAYS;

  const zLoadValue = hasEnoughHistory ? zLoad(acwrValue) : null;
  const zEffortCostValue = hasEnoughHistory && recentEffortCost != null ? zScore(recentEffortCost, effortCostBaseline) : null;
  const zWellDailyValue =
    hasEnoughHistory && recentWellDaily != null
      ? (() => {
          const raw = zScore(recentWellDaily, wellDailyBaseline);
          // Wellness is sign-flipped relative to the general form: a drop
          // below normal should read as a *worse* (positive) z, see §6.2.
          return raw === null ? null : -raw;
        })()
      : null;

  // §7-9: blend the three z-scores, squash into a bounded risk score, and
  // read off the status band.
  const C = composite(zLoadValue, zEffortCostValue, zWellDailyValue);
  const R = logisticRisk(C);
  const readiness = readinessFromRisk(R);
  const score = Math.max(0, Math.min(100, Math.round(readiness)));
  const band = bandForReadiness(score);
  const status = resolveStatus(band, activeInjury, recoveringInjury);
  const summary = plainSignal(athlete.name, status, recentWellDaily ?? 3.5);

  return {
    athleteId,
    athleteName: athlete.name,
    now,
    daysOfHistory,
    hasEnoughHistory,
    acuteLoad,
    chronicLoad,
    acwr: acwrValue,
    zLoad: zLoadValue,
    effortCostRecent: recentEffortCost,
    effortCostBaselineSize: effortCostBaseline.length,
    zEffortCost: zEffortCostValue,
    wellDailyRecent: recentWellDaily,
    wellDailyBaselineSize: wellDailyBaseline.length,
    zWellDaily: zWellDailyValue,
    composite: C,
    risk: R,
    readiness,
    score,
    band,
    status,
    summary,
    activeInjury,
    recoveringInjury,
  };
}

/**
 * Recomputes an athlete's current-week readiness from their real submitted
 * data and upserts the ReadinessScore row for this week. Call this after
 * any new wellness check-in or training log (add or remove) so the
 * Brief/Dashboard reflect it immediately. See computeReadinessBreakdown
 * above for the actual pipeline; this just persists its result.
 */
export async function recomputeReadiness(athleteId: string, now: Date = new Date()): Promise<void> {
  const b = await computeReadinessBreakdown(athleteId, now);
  const { week, year } = currentIsoWeek(now);

  await prisma.readinessScore.upsert({
    where: { athleteId_week_year: { athleteId, week, year } },
    update: { score: b.score, status: b.status, summary: b.summary },
    create: { athleteId, week, year, score: b.score, status: b.status, summary: b.summary },
  });
}

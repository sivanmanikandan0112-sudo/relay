import { prisma } from "./prisma.js";
import { bandForScore, computeScore, plainSignal, resolveStatus, riskFromAcwr } from "./readiness.js";

function currentIsoWeek(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return { week, year: d.getUTCFullYear() };
}

function avgDailyLoad(loads: { date: Date; load: number }[], days: number, now: Date): number {
  const since = new Date(now.getTime() - days * 86400000);
  const inWindow = loads.filter((l) => l.date >= since && l.date <= now);
  if (inWindow.length === 0) return 0;
  const total = inWindow.reduce((sum, l) => sum + l.load, 0);
  // Divide by however many days of history actually exist so far, not
  // always the full window -- otherwise an athlete who only started
  // logging a few days ago gets a chronic average diluted by days before
  // they'd logged anything, which inflates their acute:chronic ratio and
  // falsely flags them as overreaching in their first few weeks.
  const earliest = loads.reduce((min, l) => (l.date < min ? l.date : min), now);
  const daysOfHistory = Math.max(1, Math.ceil((now.getTime() - earliest.getTime()) / 86400000) + 1);
  const effectiveDays = Math.min(days, daysOfHistory);
  return total / effectiveDays;
}

/**
 * Recomputes an athlete's current-week readiness from their real submitted
 * data — recent wellness check-ins, recent training load (as an
 * acute:chronic workload ratio), and any active/recovering injury — and
 * upserts the ReadinessScore row for this week. Call this after any new
 * wellness check-in or training log so the Brief/Dashboard reflect it.
 */
export async function recomputeReadiness(athleteId: string, now: Date = new Date()): Promise<void> {
  const athlete = await prisma.athlete.findUniqueOrThrow({ where: { id: athleteId } });

  const [recentWellness, recentLoads, injuries] = await Promise.all([
    prisma.wellnessEntry.findMany({
      where: { athleteId, date: { lte: now } },
      orderBy: { date: "desc" },
      take: 5,
    }),
    prisma.trainingLoad.findMany({
      where: { athleteId, date: { lte: now } },
      orderBy: { date: "desc" },
      take: 60,
    }),
    prisma.injury.findMany({
      // startDate <= now matters when recomputing a *past* week (seeding
      // history, backfills): an injury shouldn't override weeks before it
      // actually started.
      where: { athleteId, status: { in: ["ACTIVE", "RECOVERING"] }, startDate: { lte: now } },
      orderBy: { startDate: "desc" },
    }),
  ]);

  const activeInjury = injuries.some((i) => i.status === "ACTIVE");
  const recoveringInjury = injuries.some((i) => i.status === "RECOVERING");

  const wellnessAvg =
    recentWellness.length > 0
      ? recentWellness.reduce((sum, w) => sum + (w.sleep + w.energy + w.mood + w.motivation + (6 - w.soreness)) / 5, 0) /
        recentWellness.length
      : 3.5; // neutral default until an athlete has logged anything

  const acute = avgDailyLoad(recentLoads, 7, now);
  const chronic = avgDailyLoad(recentLoads, 28, now) || acute || 1;
  const acwr = chronic > 0 ? acute / chronic : 1;
  const risk = riskFromAcwr(acwr || 1);

  const score = computeScore(risk, wellnessAvg);
  const band = bandForScore(score);
  const status = resolveStatus(band, activeInjury, recoveringInjury);
  const summary = plainSignal(athlete.name, status, wellnessAvg);

  const { week, year } = currentIsoWeek(now);

  await prisma.readinessScore.upsert({
    where: { athleteId_week_year: { athleteId, week, year } },
    update: { score, status, summary },
    create: { athleteId, week, year, score, status, summary },
  });
}

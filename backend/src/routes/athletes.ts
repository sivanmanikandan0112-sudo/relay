import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { canAccessAthlete, isCoachOfAthlete } from "../lib/authz.js";
import { computeReadinessBreakdown } from "../lib/scoring.js";
import { getDataPhase, mean } from "../lib/math.js";
import { groupByDay } from "../lib/date.js";

export const athletesRouter = Router();

athletesRouter.use(requireAuth);

athletesRouter.get("/:id", async (req, res) => {
  if (!(await canAccessAthlete(req.user!, req.params.id))) {
    return res.status(403).json({ error: "Not your athlete" });
  }
  const athlete = await prisma.athlete.findUnique({
    where: { id: req.params.id },
    include: {
      squad: true,
      injuries: { orderBy: { startDate: "desc" } },
    },
  });
  if (!athlete) return res.status(404).json({ error: "Athlete not found" });
  res.json(athlete);
});

// Removes an athlete from the active roster -- for someone who's stopped
// running with the team (graduated, quit, transferred). Deliberately
// NOT an account deletion: the User/Athlete rows and every check-in, run,
// readiness score, injury, and note stay exactly as they are, untouched
// -- only the roster link goes away. Re-inviting or re-approving them
// later (a new CoachAthlete row) picks their full history back up
// immediately, nothing was ever lost.
//
// Deletes EVERY CoachAthlete row for this athlete, not just the calling
// coach's own -- necessary because of how shared-school visibility
// actually works (see lib/authz.ts's getSchoolAthleteIds): any coach at
// the athlete's school sees them the moment *any* coach there has a
// CoachAthlete row for them, regardless of whose row it is. Leaving even
// one other coach's row in place would mean the athlete never actually
// disappears from the shared roster this action is meant to clean up.
//
// Any coach who can currently see this athlete may do this -- the same
// isCoachOfAthlete check every other coach-facing athlete route already
// uses, not narrowed to "only the coach who originally added them" (that
// concept doesn't really exist here: CoachAthlete is many-to-many, and
// invites can come from any coach at a school).
athletesRouter.delete("/:id/roster", requireRole("COACH"), async (req, res) => {
  const athleteId = req.params.id;
  if (!(await isCoachOfAthlete(req.user!.sub, athleteId))) {
    return res.status(403).json({ error: "Not your athlete" });
  }
  const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { id: true } });
  if (!athlete) return res.status(404).json({ error: "Athlete not found" });

  await prisma.coachAthlete.deleteMany({ where: { athleteId } });
  res.json({ removed: true });
});

athletesRouter.get("/:id/readiness-history", async (req, res) => {
  if (!(await canAccessAthlete(req.user!, req.params.id))) {
    return res.status(403).json({ error: "Not your athlete" });
  }
  const scores = await prisma.readinessScore.findMany({
    where: { athleteId: req.params.id },
    orderBy: [{ year: "asc" }, { week: "asc" }],
  });
  res.json(scores);
});

// Section 1 ("Stats"): season-to-date totals/averages + chart series --
// always meaningful from session 1, so no lookback window and no
// phase-gating, unlike the readiness pipeline itself. Section 2
// ("Workload"): the exact same acute/chronic/ACWR/risk numbers the
// readiness pipeline already computes (lib/scoring.ts), just surfaced as
// raw numbers instead of only the final rounded status -- no new math --
// plus a display-confidence phase (lib/math.ts getDataPhase) so the
// coach doesn't put weight on ACWR/risk before there's enough history
// for them to mean anything.
athletesRouter.get("/:id/stats", async (req, res) => {
  const athleteId = req.params.id;
  if (!(await canAccessAthlete(req.user!, athleteId))) {
    return res.status(403).json({ error: "Not your athlete" });
  }

  const [loads, breakdown] = await Promise.all([
    prisma.trainingLoad.findMany({ where: { athleteId }, orderBy: { date: "asc" } }),
    computeReadinessBreakdown(athleteId),
  ]);

  // Strength/cross-training days can be logged with no distance -- they
  // still count as a session (sessionCount, avgRpe) but are excluded from
  // anything distance/pace-based, same as the readiness pipeline already
  // excludes them from effort-cost.
  const distanceLoads = loads.filter((l): l is typeof l & { distanceMiles: number } => l.distanceMiles != null);
  const totalDistanceMiles = distanceLoads.reduce((sum, l) => sum + l.distanceMiles, 0);
  const totalDurationOverDistance = distanceLoads.reduce((sum, l) => sum + l.durationMin, 0);
  const avgPaceMinPerMile = totalDistanceMiles > 0 ? totalDurationOverDistance / totalDistanceMiles : null;

  const weekAgo = new Date(Date.now() - 7 * 86400000);
  const weeklyDistanceMiles = distanceLoads
    .filter((l) => l.date >= weekAgo)
    .reduce((sum, l) => sum + l.distanceMiles, 0);

  const phase = getDataPhase(breakdown.daysOfHistory);

  res.json({
    stats: {
      totalDistanceMiles,
      avgPaceMinPerMile,
      weeklyDistanceMiles,
      sessionCount: loads.length,
      avgRpe: loads.length > 0 ? mean(loads.map((l) => l.rpe)) : null,
      // Deliberately no avgSleep/avgEnergy/sleepSeries/energySeries here --
      // unlike RPE or distance, those are the athlete's own 1-5 subjective
      // check-in self-ratings, not a real measurement. Averaging a Likert
      // scale into "4.2/5" implies a precision that isn't there, and it's
      // a lossier view of the same data than the day-by-day "Check-in
      // history" table already shown lower in the detail drawer (every
      // day's real sleep/energy/mood/motivation/soreness, color-coded) --
      // so that table is the only place a coach sees these numbers.
      // One point per calendar day, not one per logged run -- a two-a-day
      // still gets logged as two separate TrainingLoad rows (real workouts
      // worth keeping individually visible elsewhere), but the trend
      // itself rolls that day up: summed distance, a true weighted pace
      // (total duration / total distance for the day, not an average of
      // each run's own pace), and the day's average RPE across every
      // session logged that day (including distance-less strength work,
      // same rows rpeSeries already included one-row-at-a-time before).
      distanceSeries: groupByDay(distanceLoads, (l) => l.date).map(({ day, items }) => ({
        date: day,
        distanceMiles: items.reduce((sum, l) => sum + l.distanceMiles, 0),
      })),
      rpeSeries: groupByDay(loads, (l) => l.date).map(({ day, items }) => ({
        date: day,
        rpe: mean(items.map((l) => l.rpe)),
      })),
      paceSeries: groupByDay(distanceLoads, (l) => l.date).map(({ day, items }) => ({
        date: day,
        paceMinPerMile: items.reduce((sum, l) => sum + l.durationMin, 0) / items.reduce((sum, l) => sum + l.distanceMiles, 0),
      })),
    },
    workload: {
      daysTracked: breakdown.daysOfHistory,
      phase: phase.phase,
      acuteReady: phase.acuteReady,
      chronicReady: phase.chronicReady,
      acuteLoad: breakdown.acuteLoad,
      chronicLoad: breakdown.chronicLoad,
      acwr: breakdown.acwr,
      risk: breakdown.risk,
      status: breakdown.status,
    },
  });
});

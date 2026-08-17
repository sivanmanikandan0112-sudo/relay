import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { getCoachAthleteIds } from "../lib/authz.js";
import { checkinRateSeries } from "../lib/activityStats.js";

export const squadsRouter = Router();

squadsRouter.use(requireAuth, requireRole("COACH"));

// Squads + counts scoped to whatever getCoachAthleteIds resolves to --
// this coach's own roster if solo, or every athlete rostered by anyone
// at their school if they belong to one. See lib/authz.ts.
squadsRouter.get("/", async (req, res) => {
  const athleteIds = await getCoachAthleteIds(req.user!.sub);
  const squads = await prisma.squad.findMany({
    include: { _count: { select: { athletes: { where: { id: { in: athleteIds } } } } } },
  });
  res.json(squads.map((s) => ({ id: s.id, name: s.name, athleteCount: s._count.athletes })));
});

squadsRouter.get("/:id/athletes", async (req, res) => {
  const athleteIds = await getCoachAthleteIds(req.user!.sub);
  const athletes = await prisma.athlete.findMany({
    where: { squadId: req.params.id, id: { in: athleteIds } },
    orderBy: { name: "asc" },
  });
  res.json(athletes);
});

const checkinRateQuerySchema = z.object({ days: z.coerce.number().int().min(1).max(60).default(7) });

// A coach-scoped, squad-scoped version of the admin overview's own
// checkinRate/activity endpoints -- "at a glance, how many of my kids
// are actually checking in" for this specific squad, not the whole
// system. See lib/activityStats.ts for why `total` is the *current*
// squad roster size held constant across the whole series.
squadsRouter.get("/:id/checkin-rate", async (req, res) => {
  const parsed = checkinRateQuerySchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const rosterIds = await getCoachAthleteIds(req.user!.sub);
  const squadAthletes = await prisma.athlete.findMany({
    where: { squadId: req.params.id, id: { in: rosterIds } },
    select: { id: true },
  });
  const series = await checkinRateSeries(
    squadAthletes.map((a) => a.id),
    parsed.data.days
  );
  res.json(series);
});

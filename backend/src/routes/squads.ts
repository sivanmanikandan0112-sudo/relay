import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { getCoachAthleteIds } from "../lib/authz.js";

export const squadsRouter = Router();

squadsRouter.use(requireAuth, requireRole("COACH"));

// Squads + counts scoped to this coach's own roster, not the whole school.
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

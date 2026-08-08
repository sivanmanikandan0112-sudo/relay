import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { canAccessAthlete } from "../lib/authz.js";

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

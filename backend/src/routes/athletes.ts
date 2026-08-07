import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const athletesRouter = Router();

athletesRouter.use(requireAuth);

athletesRouter.get("/:id", async (req, res) => {
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
  const scores = await prisma.readinessScore.findMany({
    where: { athleteId: req.params.id },
    orderBy: [{ year: "asc" }, { week: "asc" }],
  });
  res.json(scores);
});

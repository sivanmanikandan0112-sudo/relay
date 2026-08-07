import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const squadsRouter = Router();

squadsRouter.use(requireAuth);

squadsRouter.get("/", async (_req, res) => {
  const squads = await prisma.squad.findMany({
    include: { _count: { select: { athletes: true } } },
  });
  res.json(
    squads.map((s) => ({ id: s.id, name: s.name, athleteCount: s._count.athletes }))
  );
});

squadsRouter.get("/:id/athletes", async (req, res) => {
  const athletes = await prisma.athlete.findMany({
    where: { squadId: req.params.id },
    orderBy: { name: "asc" },
  });
  res.json(athletes);
});

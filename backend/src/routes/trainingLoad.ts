import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { recomputeReadiness } from "../lib/scoring.js";

export const trainingLoadRouter = Router();

trainingLoadRouter.use(requireAuth);

const createSchema = z.object({
  athleteId: z.string(),
  runType: z.string().min(1).max(40),
  distanceMiles: z.number().min(0).max(200).optional(),
  durationMin: z.number().int().min(1),
  rpe: z.number().int().min(1).max(10),
});

trainingLoadRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { athleteId, runType, distanceMiles, rpe, durationMin } = parsed.data;
  const entry = await prisma.trainingLoad.create({
    data: { athleteId, runType, distanceMiles, rpe, durationMin, load: rpe * durationMin },
  });
  await recomputeReadiness(athleteId);
  res.status(201).json(entry);
});

trainingLoadRouter.delete("/:id", async (req, res) => {
  const entry = await prisma.trainingLoad.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: "Not found" });
  await prisma.trainingLoad.delete({ where: { id: req.params.id } });
  await recomputeReadiness(entry.athleteId);
  res.status(204).end();
});

trainingLoadRouter.get("/athlete/:athleteId", async (req, res) => {
  const entries = await prisma.trainingLoad.findMany({
    where: { athleteId: req.params.athleteId },
    orderBy: { date: "desc" },
    take: 30,
  });
  res.json(entries);
});

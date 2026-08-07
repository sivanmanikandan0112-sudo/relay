import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const trainingLoadRouter = Router();

trainingLoadRouter.use(requireAuth);

const createSchema = z.object({
  athleteId: z.string(),
  rpe: z.number().int().min(1).max(10),
  durationMin: z.number().int().min(1),
});

trainingLoadRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { athleteId, rpe, durationMin } = parsed.data;
  const entry = await prisma.trainingLoad.create({
    data: { athleteId, rpe, durationMin, load: rpe * durationMin },
  });
  res.status(201).json(entry);
});

trainingLoadRouter.get("/athlete/:athleteId", async (req, res) => {
  const entries = await prisma.trainingLoad.findMany({
    where: { athleteId: req.params.athleteId },
    orderBy: { date: "desc" },
    take: 30,
  });
  res.json(entries);
});

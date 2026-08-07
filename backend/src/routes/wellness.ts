import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const wellnessRouter = Router();

wellnessRouter.use(requireAuth);

const createSchema = z.object({
  athleteId: z.string(),
  sleepHours: z.number().min(0).max(24),
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
  stress: z.number().int().min(1).max(5),
});

wellnessRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const entry = await prisma.wellnessEntry.create({ data: parsed.data });
  res.status(201).json(entry);
});

wellnessRouter.get("/athlete/:athleteId", async (req, res) => {
  const entries = await prisma.wellnessEntry.findMany({
    where: { athleteId: req.params.athleteId },
    orderBy: { date: "desc" },
    take: 30,
  });
  res.json(entries);
});

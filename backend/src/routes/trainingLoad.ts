import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { recomputeReadiness } from "../lib/scoring.js";
import { canAccessAthlete, getOwnAthleteId } from "../lib/authz.js";

export const trainingLoadRouter = Router();

trainingLoadRouter.use(requireAuth);

const createSchema = z.object({
  runType: z.string().min(1).max(60), // athlete-entered title
  distanceMiles: z.number().min(0).max(200).optional(),
  durationMin: z.number().min(0.05).max(600), // fractional minutes, from an HH:MM:SS input
  rpe: z.number().int().min(1).max(10),
});

// Same rule as wellness check-ins: a run is always logged under the
// caller's own athlete profile. An athlete can log more than once a day
// (split workouts, two-a-days) — there's no uniqueness constraint per day.
trainingLoadRouter.post("/", requireRole("ATHLETE"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const athleteId = await getOwnAthleteId(req.user!.sub);
  if (!athleteId) return res.status(403).json({ error: "No athlete profile linked to this account" });

  const { runType, rpe, durationMin } = parsed.data;
  // Enforce 2 decimal places server-side too, not just in the UI.
  const distanceMiles = parsed.data.distanceMiles != null ? Math.round(parsed.data.distanceMiles * 100) / 100 : undefined;

  const entry = await prisma.trainingLoad.create({
    data: { athleteId, runType, distanceMiles, rpe, durationMin, load: rpe * durationMin },
  });
  await recomputeReadiness(athleteId);
  res.status(201).json(entry);
});

trainingLoadRouter.delete("/:id", requireRole("ATHLETE"), async (req, res) => {
  const entry = await prisma.trainingLoad.findUnique({ where: { id: req.params.id } });
  if (!entry) return res.status(404).json({ error: "Not found" });
  const ownAthleteId = await getOwnAthleteId(req.user!.sub);
  if (entry.athleteId !== ownAthleteId) return res.status(403).json({ error: "Not your run" });

  await prisma.trainingLoad.delete({ where: { id: req.params.id } });
  await recomputeReadiness(entry.athleteId);
  res.status(204).end();
});

trainingLoadRouter.get("/athlete/:athleteId", async (req, res) => {
  if (!(await canAccessAthlete(req.user!, req.params.athleteId))) {
    return res.status(403).json({ error: "Not your athlete" });
  }
  const entries = await prisma.trainingLoad.findMany({
    where: { athleteId: req.params.athleteId },
    orderBy: { date: "desc" },
    take: 100, // generous cap; athletes can log more than once a day
  });
  res.json(entries);
});

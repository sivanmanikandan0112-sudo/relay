import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { recomputeReadiness } from "../lib/scoring.js";
import { canAccessAthlete, getOwnAthleteId } from "../lib/authz.js";
import { BACKDATE_WINDOW_DAYS, dayKey, resolveSubmissionDay } from "../lib/date.js";

export const trainingLoadRouter = Router();

trainingLoadRouter.use(requireAuth);

const createSchema = z.object({
  runType: z.string().min(1).max(60), // athlete-entered title
  distanceMiles: z.number().min(0).max(200).optional(),
  durationMin: z.number().min(0.05).max(600), // fractional minutes, from an HH:MM:SS input
  rpe: z.number().int().min(1).max(10),
  // "YYYY-MM-DD" -- omit for today. Same catch-up window as wellness.ts's
  // check-in POST; see resolveSubmissionDay for exactly how far back.
  day: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
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

  const { runType, rpe, durationMin, day: bodyDay } = parsed.data;
  // Enforce 2 decimal places server-side too, not just in the UI.
  const distanceMiles = parsed.data.distanceMiles != null ? Math.round(parsed.data.distanceMiles * 100) / 100 : undefined;

  // Same shared-clock reasoning as wellness.ts's POST / -- stamp this row
  // and recompute against one JS-side `now`, instead of racing the DB's
  // own CURRENT_TIMESTAMP default against a separately-evaluated Node
  // `new Date()` a moment later (see that file's comment for the failure
  // mode this avoids).
  const now = new Date();
  const resolved = resolveSubmissionDay(now, bodyDay);
  if (!resolved) {
    return res.status(400).json({ error: `day must be today or within the last ${BACKDATE_WINDOW_DAYS} days, not in the future` });
  }
  const { day, date } = resolved;

  const entry = await prisma.trainingLoad.create({
    data: { athleteId, runType, distanceMiles, rpe, durationMin, load: rpe * durationMin, date },
  });

  // Same "refresh today, and separately refresh the backdated day's own
  // week's snapshot" reasoning as wellness.ts's POST /.
  await recomputeReadiness(athleteId, now);
  if (day.getTime() !== dayKey(now).getTime()) {
    await recomputeReadiness(athleteId, date);
  }
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

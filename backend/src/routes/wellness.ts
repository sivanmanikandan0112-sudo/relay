import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { recomputeReadiness } from "../lib/scoring.js";
import { canAccessAthlete, getOwnAthleteId } from "../lib/authz.js";
import { dayKey } from "../lib/date.js";

export const wellnessRouter = Router();

wellnessRouter.use(requireAuth);

const createSchema = z.object({
  sleep: z.number().int().min(1).max(5),
  soreness: z.number().int().min(1).max(5),
  mood: z.number().int().min(1).max(5),
  energy: z.number().int().min(1).max(5),
  motivation: z.number().int().min(1).max(5),
  msg: z.string().trim().max(280).optional(),
});

// A check-in is always logged for the caller's own athlete profile —
// athletes can't submit on behalf of anyone else, and the athleteId is
// never taken from the request body.
wellnessRouter.post("/", requireRole("ATHLETE"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const athleteId = await getOwnAthleteId(req.user!.sub);
  if (!athleteId) return res.status(403).json({ error: "No athlete profile linked to this account" });

  // Stamped and recomputed against the same JS-side clock reading,
  // rather than letting the DB assign `date` via its own CURRENT_TIMESTAMP
  // default and then recomputing moments later against Node's `new Date()`.
  // Those are two different clocks -- if the DB host's clock runs even
  // slightly ahead of the app host's, the just-created row's DB-assigned
  // timestamp can land *after* the Node-side `now` used as this
  // recompute's own upper-bound filter, silently excluding this
  // submission from its own recompute. A shared `now` makes that
  // impossible by construction.
  const now = new Date();
  const day = dayKey(now);

  // One check-in per athlete per day: resubmitting today overwrites
  // today's row (upsert on the athleteId+day unique constraint, DB-
  // enforced, race-safe) instead of stacking another entry, so a coach
  // only ever sees the athlete's *final* answer for a given day -- in
  // the raw check-in list and in any trend built from it. The pre-check
  // is only to pick the right status code below; the upsert itself is
  // what actually guarantees correctness even under a race.
  const existing = await prisma.wellnessEntry.findUnique({ where: { athleteId_day: { athleteId, day } } });
  const entry = await prisma.wellnessEntry.upsert({
    where: { athleteId_day: { athleteId, day } },
    update: { ...parsed.data },
    create: { ...parsed.data, athleteId, date: now, day },
  });
  await recomputeReadiness(athleteId, now);
  res.status(existing ? 200 : 201).json(entry);
});

wellnessRouter.get("/athlete/:athleteId", async (req, res) => {
  if (!(await canAccessAthlete(req.user!, req.params.athleteId))) {
    return res.status(403).json({ error: "Not your athlete" });
  }
  const entries = await prisma.wellnessEntry.findMany({
    where: { athleteId: req.params.athleteId },
    orderBy: { date: "desc" },
    take: 30,
  });
  res.json(entries);
});

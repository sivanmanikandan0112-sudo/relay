import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { recomputeReadiness } from "../lib/scoring.js";
import { getCoachAthleteIds, isCoachOfAthlete } from "../lib/authz.js";

export const injuriesRouter = Router();

injuriesRouter.use(requireAuth, requireRole("COACH"));

const listQuerySchema = z.object({
  squadId: z.string().optional(),
  status: z.enum(["ACTIVE", "RECOVERING", "RESOLVED"]).optional(),
});

injuriesRouter.get("/", async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { squadId, status } = parsed.data;
  const athleteIds = await getCoachAthleteIds(req.user!.sub);

  const injuries = await prisma.injury.findMany({
    where: {
      status,
      athlete: { id: { in: athleteIds }, squadId: squadId || undefined },
    },
    include: { athlete: true },
    orderBy: { startDate: "desc" },
  });
  res.json(injuries);
});

const createSchema = z.object({
  athleteId: z.string(),
  description: z.string().min(1),
});

injuriesRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!(await isCoachOfAthlete(req.user!.sub, parsed.data.athleteId))) {
    return res.status(403).json({ error: "Not your athlete" });
  }
  // Same shared-clock reasoning as wellness.ts's POST / -- see that
  // file's comment. Here it protects baselineExclusionRanges, which
  // windows off an injury's own startDate against the recompute's `now`.
  const now = new Date();
  const injury = await prisma.injury.create({ data: { ...parsed.data, startDate: now } });
  await recomputeReadiness(parsed.data.athleteId, now);
  res.status(201).json(injury);
});

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "RECOVERING", "RESOLVED"]),
});

injuriesRouter.patch("/:id", async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const existing = await prisma.injury.findUnique({ where: { id: req.params.id } });
  if (!existing || !(await isCoachOfAthlete(req.user!.sub, existing.athleteId))) {
    return res.status(404).json({ error: "Not found" });
  }
  const injury = await prisma.injury.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      endDate: parsed.data.status === "RESOLVED" ? new Date() : null,
    },
  });
  await recomputeReadiness(injury.athleteId);
  res.json(injury);
});

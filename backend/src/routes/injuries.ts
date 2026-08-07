import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { recomputeReadiness } from "../lib/scoring.js";

export const injuriesRouter = Router();

injuriesRouter.use(requireAuth);

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

  const injuries = await prisma.injury.findMany({
    where: {
      status,
      athlete: squadId ? { squadId } : undefined,
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

injuriesRouter.post("/", requireRole("COACH"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const injury = await prisma.injury.create({ data: parsed.data });
  await recomputeReadiness(parsed.data.athleteId);
  res.status(201).json(injury);
});

const updateSchema = z.object({
  status: z.enum(["ACTIVE", "RECOVERING", "RESOLVED"]),
});

injuriesRouter.patch("/:id", requireRole("COACH"), async (req, res) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
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

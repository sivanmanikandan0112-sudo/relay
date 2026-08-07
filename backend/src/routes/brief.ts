import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const briefRouter = Router();

briefRouter.use(requireAuth);

const querySchema = z.object({
  week: z.coerce.number().int(),
  year: z.coerce.number().int(),
  squadId: z.string().optional(),
});

// The weekly brief: every athlete's latest readiness score for the given
// week, ranked worst-first so a coach sees who needs a check-in at a glance.
briefRouter.get("/", async (req, res) => {
  const parsed = querySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { week, year, squadId } = parsed.data;

  const scores = await prisma.readinessScore.findMany({
    where: {
      week,
      year,
      athlete: squadId ? { squadId } : undefined,
    },
    include: { athlete: true },
    orderBy: { score: "asc" },
  });

  res.json(scores);
});

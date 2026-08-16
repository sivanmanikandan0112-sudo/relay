import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { getCoachAthleteIds, isCoachOfAthlete } from "../lib/authz.js";

export const briefRouter = Router();

briefRouter.use(requireAuth, requireRole("COACH"));

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
  const athleteIds = await getCoachAthleteIds(req.user!.sub);

  const scores = await prisma.readinessScore.findMany({
    where: {
      week,
      year,
      athlete: { id: { in: athleteIds }, squadId: squadId || undefined },
    },
    include: {
      athlete: {
        include: {
          readinessScores: {
            orderBy: [{ year: "desc" }, { week: "desc" }],
            take: 6,
          },
        },
      },
    },
    orderBy: { score: "asc" },
  });

  // Reverse each athlete's trailing scores into chronological order so the
  // frontend can draw a left-to-right sparkline without re-sorting.
  const withTrend = scores.map((s) => ({
    ...s,
    athlete: {
      ...s.athlete,
      readinessScores: [...s.athlete.readinessScores].reverse(),
    },
  }));

  res.json(withTrend);
});

const talkedToSchema = z.object({ talked: z.boolean() });

// Marks (or clears) "I've talked to this athlete about this week's flag" on
// one week's ReadinessScore row -- backs the checkmark in the Brief's "Fit
// them into your week" list. `talked: false` clears it back to null rather
// than deleting anything; there's nothing else on the row to clean up.
briefRouter.patch("/:id/talked-to", async (req, res) => {
  const parsed = talkedToSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  const score = await prisma.readinessScore.findUnique({ where: { id: req.params.id }, select: { id: true, athleteId: true } });
  if (!score) {
    return res.status(404).json({ error: "Not found" });
  }

  if (!(await isCoachOfAthlete(req.user!.sub, score.athleteId))) {
    return res.status(404).json({ error: "Not found" });
  }

  const updated = await prisma.readinessScore.update({
    where: { id: score.id },
    data: { talkedToAt: parsed.data.talked ? new Date() : null },
  });
  res.json({ id: updated.id, talkedToAt: updated.talkedToAt });
});

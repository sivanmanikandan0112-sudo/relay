import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { canAccessAthlete, isCoachOfAthlete } from "../lib/authz.js";

export const notesRouter = Router();

notesRouter.use(requireAuth);

notesRouter.get("/athlete/:athleteId", async (req, res) => {
  if (!(await canAccessAthlete(req.user!, req.params.athleteId))) {
    return res.status(403).json({ error: "Not your athlete" });
  }
  const notes = await prisma.note.findMany({
    where: { athleteId: req.params.athleteId },
    include: { coach: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(notes.map((n) => ({ ...n, coach: { id: n.coach.id, name: `${n.coach.firstName} ${n.coach.lastName}` } })));
});

const createSchema = z.object({
  athleteId: z.string(),
  body: z.string().min(1),
});

notesRouter.post("/", requireRole("COACH"), async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (!(await isCoachOfAthlete(req.user!.sub, parsed.data.athleteId))) {
    return res.status(403).json({ error: "Not your athlete" });
  }
  const note = await prisma.note.create({
    data: {
      athleteId: parsed.data.athleteId,
      body: parsed.data.body,
      coachId: req.user!.sub,
    },
  });
  res.status(201).json(note);
});

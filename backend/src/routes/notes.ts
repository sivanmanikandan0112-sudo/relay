import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const notesRouter = Router();

notesRouter.use(requireAuth);

notesRouter.get("/athlete/:athleteId", async (req, res) => {
  const notes = await prisma.note.findMany({
    where: { athleteId: req.params.athleteId },
    include: { coach: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  res.json(notes);
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
  const note = await prisma.note.create({
    data: {
      athleteId: parsed.data.athleteId,
      body: parsed.data.body,
      coachId: req.user!.sub,
    },
  });
  res.status(201).json(note);
});

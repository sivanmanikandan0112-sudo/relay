import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { getOwnAthleteId } from "../lib/authz.js";

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const athleteId = user.role === "ATHLETE" ? await getOwnAthleteId(user.id) : null;
  let squadId: string | null = null;
  let gender: string | null = null;
  let hasCoach = false;
  if (athleteId) {
    const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { squadId: true, gender: true } });
    squadId = athlete?.squadId ?? null;
    gender = athlete?.gender ?? null;
    const coachCount = await prisma.coachAthlete.count({ where: { athleteId } });
    hasCoach = coachCount > 0;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    athleteId,
    squadId,
    gender,
    hasCoach,
  });
});

const genderSchema = z.object({
  gender: z.enum(["FEMALE", "MALE", "NONBINARY", "PREFER_NOT_TO_SAY"]),
});

// Athletes are required to specify gender at login if it isn't already set
// (see the frontend's gender gate); this is how they set it.
meRouter.patch("/gender", requireRole("ATHLETE"), async (req, res) => {
  const parsed = genderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const athleteId = await getOwnAthleteId(req.user!.sub);
  if (!athleteId) return res.status(403).json({ error: "No athlete profile linked to this account" });

  await prisma.athlete.update({ where: { id: athleteId }, data: { gender: parsed.data.gender } });
  res.json({ gender: parsed.data.gender });
});

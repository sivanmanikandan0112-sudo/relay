import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { getOwnAthleteId } from "../lib/authz.js";

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const athleteId = user.role === "ATHLETE" ? await getOwnAthleteId(user.id) : null;
  let squadId: string | null = null;
  if (athleteId) {
    const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { squadId: true } });
    squadId = athlete?.squadId ?? null;
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
  });
});

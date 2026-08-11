import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireSuperAdmin } from "../middleware/requireAuth.js";
import { getCoachAthleteIds, getSchoolAthleteIds } from "../lib/authz.js";
import { getSchoolDetail } from "../lib/schoolDetail.js";

// System-wide, read-only view across every school/coach/athlete --
// gated on isSuperAdmin (folded into the JWT, see lib/auth.ts), not any
// per-school membership check. Reuses the exact same visibility helpers
// (getCoachAthleteIds/getSchoolAthleteIds/getSchoolDetail) every
// coach-facing route already uses, just without their normal
// "only your own roster/school" restriction.
export const adminRouter = Router();

adminRouter.use(requireAuth, requireSuperAdmin);

adminRouter.get("/overview", async (_req, res) => {
  const [schoolCount, coachCount, athleteCount, soloCoachCount] = await Promise.all([
    prisma.school.count(),
    prisma.user.count({ where: { role: "COACH" } }),
    prisma.athlete.count(),
    prisma.user.count({ where: { role: "COACH", schoolId: null } }),
  ]);
  res.json({ schoolCount, coachCount, athleteCount, soloCoachCount });
});

adminRouter.get("/coaches", async (_req, res) => {
  const coaches = await prisma.user.findMany({
    where: { role: "COACH" },
    include: { school: true },
    orderBy: { createdAt: "asc" },
  });
  const withCounts = await Promise.all(
    coaches.map(async (c) => ({
      id: c.id,
      username: c.username,
      email: c.email,
      name: `${c.firstName} ${c.lastName}`,
      isSuperAdmin: c.isSuperAdmin,
      schoolId: c.schoolId,
      schoolName: c.school?.name ?? null,
      athleteCount: (await getCoachAthleteIds(c.id)).length,
      createdAt: c.createdAt,
    }))
  );
  res.json(withCounts);
});

adminRouter.get("/coaches/:id", async (req, res) => {
  const coach = await prisma.user.findUnique({ where: { id: req.params.id }, include: { school: true } });
  if (!coach || coach.role !== "COACH") return res.status(404).json({ error: "Not found" });

  const athleteIds = await getCoachAthleteIds(coach.id);
  const athletes = await prisma.athlete.findMany({
    where: { id: { in: athleteIds } },
    include: { squad: true },
    orderBy: { name: "asc" },
  });

  res.json({
    id: coach.id,
    username: coach.username,
    email: coach.email,
    name: `${coach.firstName} ${coach.lastName}`,
    isSuperAdmin: coach.isSuperAdmin,
    schoolId: coach.schoolId,
    schoolName: coach.school?.name ?? null,
    createdAt: coach.createdAt,
    athletes: athletes.map((a) => ({ id: a.id, name: a.name, squadName: a.squad.name, gender: a.gender })),
  });
});

adminRouter.get("/schools", async (_req, res) => {
  const schools = await prisma.school.findMany({ orderBy: { createdAt: "asc" } });
  const withCounts = await Promise.all(
    schools.map(async (s) => ({
      id: s.id,
      name: s.name,
      location: s.location,
      coachCount: await prisma.user.count({ where: { schoolId: s.id } }),
      athleteCount: (await getSchoolAthleteIds(s.id)).length,
      createdAt: s.createdAt,
    }))
  );
  res.json(withCounts);
});

adminRouter.get("/schools/:id", async (req, res) => {
  const detail = await getSchoolDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "Not found" });
  res.json(detail);
});

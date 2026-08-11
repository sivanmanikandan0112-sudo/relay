import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireSuperAdmin } from "../middleware/requireAuth.js";
import { getCoachAthleteIds, getSchoolAthleteIds } from "../lib/authz.js";
import { getSchoolDetail } from "../lib/schoolDetail.js";
import { issueResetToken } from "../lib/passwordReset.js";
import { emailEnabled, sendEmail } from "../lib/email.js";

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

// Every account in the system, coach or athlete -- one User table, so
// this is a single query (unlike the two roles being separate models
// somewhere else). Same OR-across-fields search shape used nowhere else
// in this app yet.
const searchSchema = z.object({ q: z.string().trim().min(1).optional() });

adminRouter.get("/users", async (req, res) => {
  const parsed = searchSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { q } = parsed.data;

  const users = await prisma.user.findMany({
    where: q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { firstName: { contains: q, mode: "insensitive" } },
            { lastName: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    include: { school: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  res.json(
    users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      name: `${u.firstName} ${u.lastName}`,
      role: u.role,
      isSuperAdmin: u.isSuperAdmin,
      schoolId: u.schoolId,
      schoolName: u.school?.name ?? null,
      mfaEnabled: u.totpEnabled,
      createdAt: u.createdAt,
    }))
  );
});

adminRouter.get("/users/:id", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id }, include: { school: true } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const base = {
    id: user.id,
    username: user.username,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    isSuperAdmin: user.isSuperAdmin,
    schoolId: user.schoolId,
    schoolName: user.school?.name ?? null,
    mfaEnabled: user.totpEnabled,
    createdAt: user.createdAt,
  };

  if (user.role === "COACH") {
    const athleteIds = await getCoachAthleteIds(user.id);
    const athletes = await prisma.athlete.findMany({
      where: { id: { in: athleteIds } },
      include: { squad: true },
      orderBy: { name: "asc" },
    });
    return res.json({ ...base, athletes: athletes.map((a) => ({ id: a.id, name: a.name, squadName: a.squad.name })) });
  }

  const athlete = await prisma.athlete.findUnique({ where: { userId: user.id }, include: { squad: true } });
  const coaches = athlete
    ? await prisma.coachAthlete.findMany({ where: { athleteId: athlete.id }, include: { coach: true } })
    : [];
  res.json({
    ...base,
    squadName: athlete?.squad.name ?? null,
    coaches: coaches.map((c) => ({ id: c.coach.id, name: `${c.coach.firstName} ${c.coach.lastName}` })),
  });
});

// Sends the *target* a real reset link -- the admin never sees or sets
// the new password, same as the self-service flow. Reuses issueResetToken
// (lib/passwordReset.ts), so it's the exact same token/expiry/email/
// dev-response behavior as POST /api/auth/forgot-password. Not rate
// limited -- already gated behind requireSuperAdmin, a different threat
// model than the public endpoints (abuse requires already having
// super-admin credentials).
adminRouter.post("/users/:id/reset-password", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const result = await issueResetToken(
    user,
    "Your Relay password has been reset",
    "Your account administrator has initiated a password reset for your Relay account."
  );
  res.json(result);
});

adminRouter.post("/users/:id/reset-mfa", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!user) return res.status(404).json({ error: "Not found" });
  if (!user.totpEnabled) {
    return res.status(400).json({ error: "This user doesn't have two-factor authentication enabled" });
  }

  await prisma.$transaction([
    prisma.mfaBackupCode.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEncrypted: null } }),
  ]);

  if (emailEnabled) {
    await sendEmail({
      to: user.email,
      subject: "Your two-factor authentication has been reset",
      html: `<p>Hi ${user.firstName},</p><p>An administrator has reset two-factor authentication on your Relay account. You can re-enable it any time from My Profile.</p><p>If this was unexpected, contact your administrator immediately.</p>`,
    });
  }

  res.json({ reset: true });
});

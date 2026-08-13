import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { getOwnAthleteId } from "../lib/authz.js";

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, include: { school: true } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const athleteId = user.role === "ATHLETE" ? await getOwnAthleteId(user.id) : null;
  let squadId: string | null = null;
  let gender: string | null = null;
  let hasCoach = false;
  let readinessShared = false;
  if (athleteId) {
    const athlete = await prisma.athlete.findUnique({
      where: { id: athleteId },
      select: { squadId: true, gender: true, shareReadinessWithAthlete: true },
    });
    squadId = athlete?.squadId ?? null;
    gender = athlete?.gender ?? null;
    readinessShared = athlete?.shareReadinessWithAthlete ?? false;
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
    readinessShared,
    schoolId: user.schoolId,
    schoolName: user.school?.name ?? null,
    isSuperAdmin: user.isSuperAdmin,
    mfaEnabled: user.totpEnabled,
  });
});

const genderSchema = z.object({
  gender: z.enum(["FEMALE", "MALE", "NONBINARY", "PREFER_NOT_TO_SAY"]),
});

// Squad (GIRLS/BOYS) tracks a real high school track/XC team structure --
// two gender-based training groups -- so FEMALE/MALE map onto it
// directly. NONBINARY and PREFER_NOT_TO_SAY have no such squad to map
// to; those athletes keep whichever squad they were invited into rather
// than being guessed at.
const GENDER_SQUAD_NAME: Partial<Record<z.infer<typeof genderSchema>["gender"], "GIRLS" | "BOYS">> = {
  FEMALE: "GIRLS",
  MALE: "BOYS",
};

// Athletes are required to specify gender at login if it isn't already set
// (see the frontend's gender gate); this is how they set it. Also moves
// them into the matching squad -- an invite's squad only reflects which
// bulk-invite the coach happened to send it from, not the athlete's own
// answer, so without this an athlete who picked "Male" could still show
// up under a coach's Girls roster just because that's who invited them.
meRouter.patch("/gender", requireRole("ATHLETE"), async (req, res) => {
  const parsed = genderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const athleteId = await getOwnAthleteId(req.user!.sub);
  if (!athleteId) return res.status(403).json({ error: "No athlete profile linked to this account" });

  const squadName = GENDER_SQUAD_NAME[parsed.data.gender];
  const squadId = squadName
    ? (await prisma.squad.upsert({ where: { name: squadName }, update: {}, create: { name: squadName } })).id
    : undefined;

  await prisma.athlete.update({
    where: { id: athleteId },
    data: { gender: parsed.data.gender, ...(squadId ? { squadId } : {}) },
  });
  res.json({ gender: parsed.data.gender });
});

const shareReadinessSchema = z.object({ share: z.boolean() });

// Self-service and athlete-owned -- a coach can't set this on an
// athlete's behalf, only the athlete themself, and only for their own
// profile (getOwnAthleteId, never a body-supplied athleteId). Off by
// default (see the schema comment on Athlete.shareReadinessWithAthlete);
// adjustable back and forth anytime.
meRouter.patch("/readiness-visibility", requireRole("ATHLETE"), async (req, res) => {
  const parsed = shareReadinessSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const athleteId = await getOwnAthleteId(req.user!.sub);
  if (!athleteId) return res.status(403).json({ error: "No athlete profile linked to this account" });

  await prisma.athlete.update({ where: { id: athleteId }, data: { shareReadinessWithAthlete: parsed.data.share } });
  res.json({ shared: parsed.data.share });
});

// The athlete's own current readiness, gated on their own preference --
// {shared: false} rather than a 403 when they've opted out, since this
// isn't really an authorization failure, it's just their own choice not
// to look. `latest` is the same ReadinessScore row the coach-facing
// readiness-history endpoint returns, just read through a self-scoped
// path (recomputeReadiness already writes it; no new computation here).
meRouter.get("/readiness", requireRole("ATHLETE"), async (req, res) => {
  const athleteId = await getOwnAthleteId(req.user!.sub);
  if (!athleteId) return res.status(403).json({ error: "No athlete profile linked to this account" });

  const athlete = await prisma.athlete.findUniqueOrThrow({
    where: { id: athleteId },
    select: { shareReadinessWithAthlete: true },
  });
  if (!athlete.shareReadinessWithAthlete) {
    return res.json({ shared: false, latest: null });
  }

  const latest = await prisma.readinessScore.findFirst({
    where: { athleteId },
    orderBy: [{ year: "desc" }, { week: "desc" }],
  });
  res.json({ shared: true, latest });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// Both roles -- no requireRole, matching GET / above. Requires the
// current password (not just being logged in) before setting a new one,
// same spirit as the athlete gender gate requiring a real answer rather
// than trusting session state alone for a sensitive change.
meRouter.patch("/password", async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ changed: true });
});

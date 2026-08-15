import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { GENDER_TO_SQUAD } from "../lib/gender.js";

// Public, unauthenticated -- this is the real half of the invite flow.
// routes/invites.ts and routes/schools.ts (both coach-authenticated)
// create the Invite with a token; the invited person follows the link
// built from that token to actually create their account (ATHLETE) or,
// for a COACH_TO_SCHOOL invite where an account already exists for that
// email, to confirm joining the school (see POST /:token/attach below)
// -- with no login required first for the create-account path.
export const inviteAcceptRouter = Router();

async function findValidInvite(token: string) {
  const invite = await prisma.invite.findUnique({
    where: { token },
    include: { school: true, invitedBy: true },
  });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) return null;
  return invite;
}

// Lets the frontend show "you've been invited by <coach> to join <squad>"
// (or "...to join <school> as a coach") before asking for any account
// details -- and, for a COACH_TO_SCHOOL invite, whether an account
// already exists for that email, so it can render the create-account
// form or the "log in to confirm" panel accordingly.
inviteAcceptRouter.get("/:token", async (req, res) => {
  const invite = await findValidInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: "This invite link is invalid, expired, or already used." });

  const targetAccountExists =
    invite.type === "COACH_TO_SCHOOL" ? !!(await prisma.user.findUnique({ where: { email: invite.email } })) : false;

  res.json({
    email: invite.email,
    type: invite.type,
    schoolName: invite.school?.name ?? null,
    coachName: `${invite.invitedBy.firstName} ${invite.invitedBy.lastName}`,
    targetAccountExists,
  });
});

const acceptSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/i, "Letters, numbers, dots, dashes, and underscores only"),
  password: z.string().min(8),
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  // Required for an ATHLETE invite (validated below, once we know
  // invite.type), unused for COACH_TO_SCHOOL -- same question, same
  // options, as the post-login gender gate. Determines the athlete's
  // squad directly (see GENDER_TO_SQUAD below) instead of a coach
  // guessing at Girls/Boys when they sent the invite.
  gender: z.enum(["FEMALE", "MALE", "NONBINARY", "PREFER_NOT_TO_SAY"]).optional(),
});

// Creates the real account: for an ATHLETE invite, a User (role
// ATHLETE), an Athlete profile in the squad matching the gender they
// just answered, and the CoachAthlete row linking them to whoever sent
// the invite; for a COACH_TO_SCHOOL invite, a User (role COACH) with
// schoolId set directly -- no Athlete/CoachAthlete rows, since a coach's
// roster visibility comes from a live join through schoolId (see
// lib/authz.ts), not anything created here. Either way, logs them
// straight in, same response shape as POST /api/auth/login. Only for an
// email with no existing account yet -- see POST /:token/attach for the
// case where one already exists.
inviteAcceptRouter.post("/:token", async (req, res) => {
  const invite = await findValidInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: "This invite link is invalid, expired, or already used." });
  if (invite.type === "COACH_TO_SCHOOL" && !invite.schoolId) {
    return res.status(400).json({ error: "This invite has no school assigned — ask for a new one." });
  }

  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  if (invite.type === "ATHLETE" && !parsed.data.gender) {
    return res.status(400).json({ error: "Pick a gender to continue" });
  }
  const { username, password, firstName, lastName } = parsed.data;

  const usernameTaken = await prisma.user.findUnique({ where: { username } });
  if (usernameTaken) return res.status(409).json({ error: "That username is already taken" });
  const emailTaken = await prisma.user.findUnique({ where: { email: invite.email } });
  if (emailTaken) {
    return res.status(409).json({
      error:
        invite.type === "COACH_TO_SCHOOL"
          ? "An account already exists for this invite's email — log in to confirm you're joining instead."
          : "An account already exists for this invite's email — try signing in instead.",
    });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (invite.type === "COACH_TO_SCHOOL") {
    const [user] = await prisma.$transaction([
      prisma.user.create({
        data: { username, email: invite.email, passwordHash, firstName, lastName, role: "COACH", schoolId: invite.schoolId },
      }),
      prisma.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", respondedAt: new Date() } }),
    ]);

    const token = signToken({ sub: user.id, role: user.role, isSuperAdmin: false });
    return res.status(201).json({
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        athleteId: null,
        gender: null,
        hasCoach: false,
        schoolId: user.schoolId,
        schoolName: invite.school?.name ?? null,
        isSuperAdmin: false,
      },
    });
  }

  // Same fallback as every other unmapped-gender case in this app (see
  // lib/gender.ts) -- GIRLS is an arbitrary but harmless starting squad
  // for NONBINARY/PREFER_NOT_TO_SAY.
  const gender = parsed.data.gender!;
  const squadName = GENDER_TO_SQUAD[gender] ?? "GIRLS";

  const { user, athlete } = await prisma.$transaction(async (tx) => {
    const squad = await tx.squad.upsert({ where: { name: squadName }, update: {}, create: { name: squadName } });
    const user = await tx.user.create({
      data: { username, email: invite.email, passwordHash, firstName, lastName, role: "ATHLETE" },
    });
    // gender is set directly from the athlete's own answer here -- they
    // never hit the post-login gender gate the way an athlete invited
    // before this change would have.
    const athlete = await tx.athlete.create({
      data: { name: `${firstName} ${lastName}`, gender, squadId: squad.id, userId: user.id },
    });
    await tx.coachAthlete.create({ data: { coachId: invite.invitedById, athleteId: athlete.id } });
    await tx.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    return { user, athlete };
  });

  const token = signToken({ sub: user.id, role: user.role, isSuperAdmin: false });
  res.status(201).json({
    token,
    user: {
      id: user.id,
      username: user.username,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      athleteId: athlete.id,
      gender: athlete.gender,
      hasCoach: true,
      readinessShared: false,
      schoolId: null,
      schoolName: null,
      isSuperAdmin: false,
    },
  });
});

// The consent-gated counterpart to POST /:token, for a COACH_TO_SCHOOL
// invite whose email already has an account: rather than silently
// reassigning someone else's account to a school from an unauthenticated
// request, the account owner must be signed in as themself and confirm.
inviteAcceptRouter.post("/:token/attach", requireAuth, requireRole("COACH"), async (req, res) => {
  const invite = await findValidInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: "This invite link is invalid, expired, or already used." });
  if (invite.type !== "COACH_TO_SCHOOL" || !invite.schoolId) {
    return res.status(400).json({ error: "This invite isn't a school invite." });
  }

  const me = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (me.email.toLowerCase() !== invite.email.toLowerCase()) {
    return res.status(403).json({
      error: `You're signed in as ${me.email}, but this invite was sent to ${invite.email}. Log in as that account to confirm.`,
    });
  }

  const [updated] = await prisma.$transaction([
    prisma.user.update({ where: { id: me.id }, data: { schoolId: invite.schoolId } }),
    prisma.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", respondedAt: new Date() } }),
  ]);

  res.json({ schoolId: updated.schoolId, schoolName: invite.school?.name ?? null });
});

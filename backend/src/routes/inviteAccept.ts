import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";

// Public, unauthenticated -- this is the real half of the invite flow.
// routes/invites.ts (coach-authenticated) creates the Invite with a
// token; an invited athlete follows the link built from that token to
// actually create their account here, with no login required first.
export const inviteAcceptRouter = Router();

async function findValidInvite(token: string) {
  const invite = await prisma.invite.findUnique({ where: { token }, include: { squad: true, invitedBy: true } });
  if (!invite || invite.status !== "PENDING" || invite.expiresAt < new Date()) return null;
  return invite;
}

// Lets the frontend show "you've been invited by <coach> to join <squad>"
// before asking for any account details.
inviteAcceptRouter.get("/:token", async (req, res) => {
  const invite = await findValidInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: "This invite link is invalid, expired, or already used." });
  res.json({
    email: invite.email,
    squadName: invite.squad?.name ?? null,
    coachName: `${invite.invitedBy.firstName} ${invite.invitedBy.lastName}`,
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
});

// Creates the real account: a User (role ATHLETE), an Athlete profile in
// the invite's squad, and the CoachAthlete row linking them to whoever
// sent the invite -- then logs them straight in, same response shape as
// POST /api/auth/login, so the frontend can treat it identically.
inviteAcceptRouter.post("/:token", async (req, res) => {
  const invite = await findValidInvite(req.params.token);
  if (!invite) return res.status(404).json({ error: "This invite link is invalid, expired, or already used." });
  if (!invite.squadId) {
    return res.status(400).json({ error: "This invite has no squad assigned — ask your coach to re-send it." });
  }

  const parsed = acceptSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { username, password, firstName, lastName } = parsed.data;

  const usernameTaken = await prisma.user.findUnique({ where: { username } });
  if (usernameTaken) return res.status(409).json({ error: "That username is already taken" });
  const emailTaken = await prisma.user.findUnique({ where: { email: invite.email } });
  if (emailTaken) {
    return res.status(409).json({ error: "An account already exists for this invite's email — try signing in instead." });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const { user, athlete } = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { username, email: invite.email, passwordHash, firstName, lastName, role: "ATHLETE" },
    });
    const athlete = await tx.athlete.create({
      data: { name: `${firstName} ${lastName}`, squadId: invite.squadId!, userId: user.id },
    });
    await tx.coachAthlete.create({ data: { coachId: invite.invitedById, athleteId: athlete.id } });
    await tx.invite.update({ where: { id: invite.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    return { user, athlete };
  });

  const token = signToken({ sub: user.id, role: user.role });
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
      gender: null,
      hasCoach: true,
    },
  });
});

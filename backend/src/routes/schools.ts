import { Router, type Request } from "express";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { getSchoolDetail } from "../lib/schoolDetail.js";
import { emailEnabled, trySendEmail } from "../lib/email.js";
import { env } from "../lib/env.js";
import { assignNewJoinCode } from "../lib/joinCode.js";
import { GENDER_TO_SQUAD } from "../lib/gender.js";
import { rotateInviteToken } from "../lib/inviteResend.js";

export const schoolsRouter = Router();

// Same expiry every other invite in the app uses (routes/invites.ts) --
// kept as a separate constant here rather than shared, since it's a
// single literal and these are two independent invite flows that
// happen to agree on a duration, not two callers of shared logic.
const INVITE_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

schoolsRouter.use(requireAuth, requireRole("COACH"));

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).optional(),
});

// Self-service, deliberately not admin-gated: any coach can type in a
// school name to create it, and becomes its first member. Creating only
// succeeds when the name doesn't already exist (case-insensitive, DB
// -enforced via the nameKey unique index -- race-safe, not just a
// pre-check) -- joining an *existing* school always goes through
// POST /:id/invite-coach + accept instead, never by independently typing
// the same name, since that would let anyone claim membership (and the
// whole shared roster that comes with it) in a school with zero consent
// from anyone already there.
schoolsRouter.post("/", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const coach = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (coach.schoolId) {
    return res.status(400).json({ error: "You already belong to a school." });
  }

  const { name, location } = parsed.data;
  try {
    const school = await prisma.$transaction(async (tx) => {
      const school = await tx.school.create({
        data: { name, nameKey: normalizeKey(name), location },
      });
      await tx.user.update({ where: { id: coach.id }, data: { schoolId: school.id } });
      return school;
    });
    const joinCode = await assignNewJoinCode(school.id);
    res.status(201).json({ id: school.id, name: school.name, location: school.location, joinCode });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "A school with that name already exists — ask a coach there to invite you." });
    }
    throw err;
  }
});

// The caller's own school (member coaches, shared roster size, pending
// coach invites) -- null if solo. Powers the self-service School page.
schoolsRouter.get("/mine", async (req, res) => {
  const coach = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!coach.schoolId) return res.json({ school: null });
  res.json({ school: await getSchoolDetail(coach.schoolId) });
});

async function requireMembership(req: Request): Promise<boolean> {
  const coach = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  return coach.isSuperAdmin || coach.schoolId === req.params.id;
}

schoolsRouter.get("/:id", async (req, res) => {
  if (!(await requireMembership(req))) return res.status(403).json({ error: "Forbidden" });
  const detail = await getSchoolDetail(req.params.id);
  if (!detail) return res.status(404).json({ error: "Not found" });
  res.json(detail);
});

// Same shape as create -- a coach can rename their school (or change its
// location) after the fact, e.g. to fix a typo. Same collision handling
// as create: renaming to a name already used by a *different* school is
// a 409, race-safe via the DB constraint, not just a pre-check. Renaming
// to the school's own current name is a no-op, not a conflict.
const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  location: z.string().trim().max(120).optional(),
});

schoolsRouter.patch("/:id", async (req, res) => {
  if (!(await requireMembership(req))) return res.status(403).json({ error: "Forbidden" });
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { name, location } = parsed.data;

  try {
    const school = await prisma.school.update({
      where: { id: req.params.id },
      data: { name, nameKey: normalizeKey(name), location },
    });
    res.json({ id: school.id, name: school.name, location: school.location });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002") {
        return res.status(409).json({ error: "A school with that name already exists." });
      }
      if (err.code === "P2025") {
        return res.status(404).json({ error: "Not found" });
      }
    }
    throw err;
  }
});

const inviteCoachSchema = z.object({ email: z.string().trim().email() });

// Invite another coach into *this* school -- only usable by a coach who
// already belongs to it (or a super admin acting on any school). Always
// creates a real Invite row and sends/returns it the same way
// routes/invites.ts's bulk athlete invite does; the accept side (see
// routes/inviteAccept.ts) branches on whether that email already has an
// account -- a brand-new signup either way, or a consent-gated "confirm
// you're joining" for an existing one. Note: if the invited email
// belongs to an existing coach at a *different* school already, this
// still works -- accepting doubles as switching, since there's no
// separate "leave school" step, and it's still the account owner
// confirming it themself either way.
schoolsRouter.post("/:id/invite-coach", async (req, res) => {
  if (!(await requireMembership(req))) return res.status(403).json({ error: "Forbidden" });
  const school = await prisma.school.findUnique({ where: { id: req.params.id } });
  if (!school) return res.status(404).json({ error: "Not found" });

  const parsed = inviteCoachSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const email = parsed.data.email.toLowerCase();
  const coach = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });

  const existingInvite = await prisma.invite.findFirst({
    where: { email, schoolId: school.id, type: "COACH_TO_SCHOOL", status: "PENDING" },
  });
  if (existingInvite) {
    return res.status(409).json({ error: "There's already a pending invite out to that email for this school." });
  }

  const invite = await prisma.invite.create({
    data: {
      email,
      invitedById: coach.id,
      type: "COACH_TO_SCHOOL",
      schoolId: school.id,
      token: crypto.randomBytes(24).toString("hex"),
      expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS),
    },
  });

  // The invite already exists in the DB regardless of what happens next
  // -- trySendEmail can't fail this response (see its own comment).
  let emailSent = false;
  if (emailEnabled) {
    const acceptUrl = `${env.frontendUrl}/accept-invite/${invite.token}`;
    emailSent = await trySendEmail({
      to: invite.email,
      subject: `${coach.firstName} ${coach.lastName} invited you to join ${school.name} on Relay`,
      html: `<p>${coach.firstName} ${coach.lastName} invited you to join <strong>${school.name}</strong> on Relay as a coach.</p><p><a href="${acceptUrl}">${acceptUrl}</a></p><p>This link expires in 14 days.</p>`,
    });
  }

  res.status(201).json({ invite, emailSent });
});

// Re-sends a PENDING coach invite for this school -- any member coach
// can do this, not just whoever originally sent it (the same
// requireMembership gate every other school-management route here
// already uses; the "Pending coach invites" list itself is already
// school-wide, not scoped to who sent each one, so managing them the
// same way is consistent). Most useful for an expired one, but works
// for a non-expired one too. Rotates onto a fresh token/expiry via
// rotateInviteToken rather than resending the same old link.
schoolsRouter.post("/:id/invites/:inviteId/resend", async (req, res) => {
  if (!(await requireMembership(req))) return res.status(403).json({ error: "Forbidden" });
  const invite = await prisma.invite.findUnique({ where: { id: req.params.inviteId } });
  if (!invite || invite.schoolId !== req.params.id || invite.type !== "COACH_TO_SCHOOL") {
    return res.status(404).json({ error: "Not found" });
  }
  if (invite.status !== "PENDING") {
    return res.status(400).json({ error: "Only a pending invite can be resent" });
  }

  const school = await prisma.school.findUniqueOrThrow({ where: { id: req.params.id } });
  const coach = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  const updated = await rotateInviteToken(invite.id);

  let emailSent = false;
  if (emailEnabled) {
    const acceptUrl = `${env.frontendUrl}/accept-invite/${updated.token}`;
    emailSent = await trySendEmail({
      to: updated.email,
      subject: `${coach.firstName} ${coach.lastName} invited you to join ${school.name} on Relay`,
      html: `<p>${coach.firstName} ${coach.lastName} invited you to join <strong>${school.name}</strong> on Relay as a coach.</p><p><a href="${acceptUrl}">${acceptUrl}</a></p><p>This link expires in 14 days.</p>`,
    });
  }
  res.json({ invite: updated, emailSent });
});

// Replaces this school's join code -- e.g. if it's been shared somewhere
// it shouldn't have been, or a coach just wants a fresh one for a new
// season. The old code stops resolving immediately; any requests already
// submitted under it are untouched (see lib/joinCode.ts's own comment).
schoolsRouter.post("/:id/regenerate-code", async (req, res) => {
  if (!(await requireMembership(req))) return res.status(403).json({ error: "Forbidden" });
  const school = await prisma.school.findUnique({ where: { id: req.params.id } });
  if (!school) return res.status(404).json({ error: "Not found" });

  const joinCode = await assignNewJoinCode(school.id);
  res.json({ joinCode });
});

// Every coach at the school sees the same shared queue -- matches how
// the roster itself is already shared school-wide (see lib/authz.ts).
schoolsRouter.get("/:id/requests", async (req, res) => {
  if (!(await requireMembership(req))) return res.status(403).json({ error: "Forbidden" });
  const requests = await prisma.schoolJoinRequest.findMany({
    where: { schoolId: req.params.id, status: "PENDING" },
    orderBy: { createdAt: "asc" },
  });
  res.json(
    requests.map((r) => ({
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      username: r.username,
      email: r.email,
      gender: r.gender,
      createdAt: r.createdAt,
    })),
  );
});

async function findPendingRequest(schoolId: string, requestId: string) {
  const request = await prisma.schoolJoinRequest.findUnique({ where: { id: requestId } });
  if (!request || request.schoolId !== schoolId || request.status !== "PENDING") return null;
  return request;
}

// Materializes the real account this request has been standing in for --
// a User (role ATHLETE), an Athlete profile in the requested squad, and
// a CoachAthlete row making *this* approving coach the athlete's roster
// coach (whoever at the school actually claims them, first-to-approve),
// exactly mirroring inviteAccept.ts's own ATHLETE-invite branch. Re-checks
// the username/email collision at approval time, not just at submission
// -- days could have passed, and someone else may have taken it since.
schoolsRouter.post("/:id/requests/:reqId/approve", async (req, res) => {
  if (!(await requireMembership(req))) return res.status(403).json({ error: "Forbidden" });
  const request = await findPendingRequest(req.params.id, req.params.reqId);
  if (!request) return res.status(404).json({ error: "Not found" });

  const collision = await prisma.user.findFirst({ where: { OR: [{ username: request.username }, { email: request.email }] } });
  if (collision) {
    return res.status(409).json({
      error: "That username or email has been taken since this request came in — reject it and ask them to request again.",
    });
  }

  // Same fallback as an unmapped gender ever gets anywhere in this app
  // (see lib/gender.ts) -- GIRLS is an arbitrary but harmless starting
  // squad for NONBINARY/PREFER_NOT_TO_SAY, since there's no invite squad
  // to fall back to the way routes/me.ts's own PATCH /gender has.
  const squadName = GENDER_TO_SQUAD[request.gender] ?? "GIRLS";
  const coachId = req.user!.sub;
  const { user, athlete } = await prisma.$transaction(async (tx) => {
    const squad = await tx.squad.upsert({ where: { name: squadName }, update: {}, create: { name: squadName } });
    const user = await tx.user.create({
      data: {
        username: request.username,
        email: request.email,
        passwordHash: request.passwordHash,
        firstName: request.firstName,
        lastName: request.lastName,
        role: "ATHLETE",
      },
    });
    // gender is set directly from the request's own answer -- an
    // athlete who came in this way already told /join their gender, so
    // they never hit the post-login gender gate the way an invited
    // athlete does.
    const athlete = await tx.athlete.create({
      data: { name: `${request.firstName} ${request.lastName}`, gender: request.gender, squadId: squad.id, userId: user.id },
    });
    await tx.coachAthlete.create({ data: { coachId, athleteId: athlete.id } });
    await tx.schoolJoinRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", decidedAt: new Date(), decidedByUserId: coachId },
    });
    return { user, athlete };
  });

  // The account already exists at this point regardless of what happens
  // next -- this is exactly the call site that crashed production once
  // (a bad recipient rejected by Resend, unguarded). trySendEmail can't
  // fail this response.
  if (emailEnabled) {
    await trySendEmail({
      to: user.email,
      subject: "You're in! Your Relay account is ready",
      html: `<p>Hey ${user.firstName}, your coach approved your request to join Relay. Sign in any time with the username <strong>${user.username}</strong> and the password you chose.</p><p><a href="${env.frontendUrl}/login">${env.frontendUrl}/login</a></p>`,
    });
  }

  res.json({ athleteId: athlete.id, username: user.username });
});

// Closes the request out with no account ever created -- nothing to
// undo, since approve is the only path that materializes a User.
schoolsRouter.post("/:id/requests/:reqId/reject", async (req, res) => {
  if (!(await requireMembership(req))) return res.status(403).json({ error: "Forbidden" });
  const request = await findPendingRequest(req.params.id, req.params.reqId);
  if (!request) return res.status(404).json({ error: "Not found" });

  await prisma.schoolJoinRequest.update({
    where: { id: request.id },
    data: { status: "REJECTED", decidedAt: new Date(), decidedByUserId: req.user!.sub },
  });
  res.status(204).end();
});

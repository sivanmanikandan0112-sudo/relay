import { Router, type Request } from "express";
import crypto from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { getSchoolDetail } from "../lib/schoolDetail.js";
import { emailEnabled, sendEmail } from "../lib/email.js";
import { env } from "../lib/env.js";

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
    res.status(201).json({ id: school.id, name: school.name, location: school.location });
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

  let emailSent = false;
  if (emailEnabled) {
    const acceptUrl = `${env.frontendUrl}/accept-invite/${invite.token}`;
    await sendEmail({
      to: invite.email,
      subject: `${coach.firstName} ${coach.lastName} invited you to join ${school.name} on Relay`,
      html: `<p>${coach.firstName} ${coach.lastName} invited you to join <strong>${school.name}</strong> on Relay as a coach.</p><p><a href="${acceptUrl}">${acceptUrl}</a></p><p>This link expires in 14 days.</p>`,
    });
    emailSent = true;
  }

  res.status(201).json({ invite, emailSent });
});

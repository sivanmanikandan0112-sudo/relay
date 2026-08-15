import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { joinCodeLookupLimiter, joinRequestLimiter } from "../lib/rateLimit.js";

// Public, unauthenticated -- the athlete-initiated half of the school
// join-code flow. routes/schools.ts (coach-authenticated) owns the code
// itself (viewing/regenerating it) and the coach-side approve/reject
// actions; this file is only ever the anonymous visitor's side: look up
// what a code resolves to, then submit a request against it. Deliberately
// mounted at its own /api/join base rather than folded into
// routes/schools.ts, since that whole router is gated behind
// requireAuth+requireRole("COACH") up front -- there's no clean way to
// carve out a public exception mid-router.
export const schoolJoinRouter = Router();

schoolJoinRouter.get("/:code", joinCodeLookupLimiter, async (req, res) => {
  const school = await prisma.school.findUnique({ where: { joinCode: req.params.code.toUpperCase() } });
  if (!school) return res.status(404).json({ error: "That code doesn't match any school. Double-check it with your coach." });
  res.json({ schoolName: school.name });
});

const requestSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  username: z
    .string()
    .trim()
    .min(3)
    .max(40)
    .regex(/^[a-z0-9._-]+$/i, "Letters, numbers, dots, dashes, and underscores only"),
  email: z.string().trim().email(),
  password: z.string().min(8),
  gender: z.enum(["FEMALE", "MALE", "NONBINARY", "PREFER_NOT_TO_SAY"]),
});

// Creates a SchoolJoinRequest, never a User -- no account exists until a
// coach at this school approves it (see schema.prisma's own comment on
// SchoolJoinRequest for why). Re-checks username/email against both real
// accounts *and* other still-pending requests, so two people can't queue
// up on the same desired username and only find out one fails at
// approval time, days later.
schoolJoinRouter.post("/:code", joinRequestLimiter, async (req, res) => {
  const school = await prisma.school.findUnique({ where: { joinCode: req.params.code.toUpperCase() } });
  if (!school) return res.status(404).json({ error: "That code doesn't match any school. Double-check it with your coach." });

  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { firstName, lastName, username, email, password, gender } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const [userTaken, pendingUsername, pendingEmail] = await Promise.all([
    prisma.user.findFirst({ where: { OR: [{ username }, { email: normalizedEmail }] } }),
    prisma.schoolJoinRequest.findFirst({ where: { username, status: "PENDING" } }),
    prisma.schoolJoinRequest.findFirst({ where: { email: normalizedEmail, schoolId: school.id, status: "PENDING" } }),
  ]);
  if (userTaken) {
    return res.status(409).json({ error: "That username or email is already in use — try signing in instead." });
  }
  if (pendingUsername) {
    return res.status(409).json({ error: "That username is already tied to a pending request." });
  }
  if (pendingEmail) {
    return res.status(409).json({ error: "You already have a pending request for this school." });
  }

  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.schoolJoinRequest.create({
    data: { schoolId: school.id, firstName, lastName, username, email: normalizedEmail, passwordHash, gender },
  });

  res.status(201).json({ schoolName: school.name });
});

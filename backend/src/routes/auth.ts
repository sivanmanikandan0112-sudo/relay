import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";
import { getOwnAthleteId } from "../lib/authz.js";
import { emailEnabled, sendEmail } from "../lib/email.js";
import { env } from "../lib/env.js";

export const authRouter = Router();

function publicUser(user: { id: string; username: string; email: string; firstName: string; lastName: string; role: string }) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
  };
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = signToken({ sub: user.id, role: user.role });
  const athleteId = user.role === "ATHLETE" ? await getOwnAthleteId(user.id) : null;

  let gender: string | null = null;
  let hasCoach = false;
  if (athleteId) {
    const athlete = await prisma.athlete.findUnique({ where: { id: athleteId }, select: { gender: true } });
    gender = athlete?.gender ?? null;
    hasCoach = (await prisma.coachAthlete.count({ where: { athleteId } })) > 0;
  }

  res.json({ token, user: { ...publicUser(user), athleteId, gender, hasCoach } });
});

// --- Forgot / reset password -------------------------------------------
// In production (RESEND_API_KEY set), this actually emails resetUrl and
// the token never appears in the API response -- returning it alongside a
// real send would defeat the point of proving the requester owns that
// inbox. Without a configured provider (local dev/test), it's simulated:
// logged to the console, and the token comes back in the response instead
// so the UI can show a "continue to reset" link directly.
const forgotSchema = z.object({ username: z.string().min(1) });

authRouter.post("/forgot-password", async (req, res) => {
  const parsed = forgotSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await prisma.user.findUnique({ where: { username: parsed.data.username } });

  // Same response whether or not the username exists, so this endpoint
  // can't be used to enumerate valid usernames.
  if (!user) {
    return res.json({ sent: true });
  }

  const token = crypto.randomBytes(24).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token, expiresAt: new Date(Date.now() + 30 * 60 * 1000) },
  });
  const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;

  if (emailEnabled) {
    await sendEmail({
      to: user.email,
      subject: "Reset your Relay password",
      html: `<p>Hi ${user.firstName},</p><p>Click below to reset your Relay password. This link expires in 30 minutes.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });
    return res.json({ sent: true });
  }

  res.json({ sent: true, devResetToken: token, devNote: "No email provider configured — use this token directly." });
});

const resetSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(8),
});

authRouter.post("/reset-password", async (req, res) => {
  const parsed = resetSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { token, newPassword } = parsed.data;

  const record = await prisma.passwordResetToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return res.status(400).json({ error: "Reset link is invalid or expired" });
  }

  const passwordHash = await bcrypt.hash(newPassword, 10);
  await prisma.$transaction([
    prisma.user.update({ where: { id: record.userId }, data: { passwordHash } }),
    prisma.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
  ]);

  res.json({ reset: true });
});

import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken } from "../lib/auth.js";
import { getOwnAthleteId } from "../lib/authz.js";

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
  res.json({ token, user: { ...publicUser(user), athleteId } });
});

// --- Forgot / reset password -------------------------------------------
// No email provider is configured in this dev environment, so instead of
// sending an email we return the reset link directly in the response. A
// real deployment would email resetUrl instead of returning it.
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

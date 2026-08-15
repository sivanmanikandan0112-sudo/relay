import { Router } from "express";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { signToken, verifyToken } from "../lib/auth.js";
import { getOwnAthleteId } from "../lib/authz.js";
import { issueResetToken } from "../lib/passwordReset.js";
import { hashToken } from "../lib/tokenHash.js";
import { decrypt } from "../lib/crypto.js";
import { loginLimiter, forgotPasswordLimiter, mfaVerifyLimiter, googleLoginLimiter } from "../lib/rateLimit.js";
import { dayKey } from "../lib/date.js";
import { verifyGoogleIdToken } from "../lib/google.js";
import type { User, School } from "@prisma/client";

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

// Builds the same { token, user } shape whether a session comes from a
// plain password login (no MFA), or from POST /mfa/verify completing a
// two-step one -- the frontend's setSession() treats either identically.
async function buildSession(user: User & { school: School | null }) {
  const token = signToken({ sub: user.id, role: user.role, isSuperAdmin: user.isSuperAdmin });

  // One row per user per day for the super admin's activity calendars
  // (routes/admin.ts) -- upserted, not created fresh each time, so a
  // user logging in five times today is still just one day of activity,
  // not five. Both real-session paths that call buildSession (plain
  // login and MFA-verify completion) get this for free from here.
  const day = dayKey(new Date());
  await prisma.loginEvent.upsert({
    where: { userId_day: { userId: user.id, day } },
    update: {},
    create: { userId: user.id, role: user.role, day },
  });

  const athleteId = user.role === "ATHLETE" ? await getOwnAthleteId(user.id) : null;

  let gender: string | null = null;
  let hasCoach = false;
  let readinessShared = false;
  if (athleteId) {
    const athlete = await prisma.athlete.findUnique({
      where: { id: athleteId },
      select: { gender: true, shareReadinessWithAthlete: true },
    });
    gender = athlete?.gender ?? null;
    readinessShared = athlete?.shareReadinessWithAthlete ?? false;
    hasCoach = (await prisma.coachAthlete.count({ where: { athleteId } })) > 0;
  }

  return {
    token,
    user: {
      ...publicUser(user),
      athleteId,
      gender,
      hasCoach,
      readinessShared,
      schoolId: user.schoolId,
      schoolName: user.school?.name ?? null,
      isSuperAdmin: user.isSuperAdmin,
      mfaEnabled: user.totpEnabled,
      googleLinked: !!user.googleId,
    },
  };
}

// Shared by both real ways to prove "I am this user" (a correct password,
// or a verified Google identity already linked to this account): if MFA
// is enabled, neither one is enough on its own -- issue the same 5-minute
// mfaPending temp token POST /mfa/verify expects, instead of a real
// session. Google sign-in doesn't get to skip a second factor just
// because it's a different first factor.
async function sessionOrMfaChallenge(user: User & { school: School | null }) {
  if (user.totpEnabled) {
    const tempToken = signToken({ sub: user.id, role: user.role, isSuperAdmin: user.isSuperAdmin, mfaPending: true }, { expiresIn: "5m" });
    return { mfaRequired: true as const, tempToken };
  }
  return buildSession(user);
}

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

authRouter.post("/login", loginLimiter, async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const { username, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { username }, include: { school: true } });
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  // Password verified, but if MFA is enabled that's only the first
  // factor -- sessionOrMfaChallenge issues the short-lived tempToken
  // instead (requireAuth rejects it outright on every ordinary route;
  // see middleware/requireAuth.ts), and POST /mfa/verify finishes it.
  res.json(await sessionOrMfaChallenge(user));
});

// "Sign in with Google" -- only usable for an account that already
// linked a Google identity from My Profile (see routes/me.ts's
// POST /google-link). Never creates an account and never bypasses the
// athlete-invite flow: an unrecognized Google identity here is a 404,
// not a signup. The verified ID token proves the same thing a correct
// password does -- "I am this user" -- so it goes through the exact
// same MFA gate as a password login, not around it.
const googleLoginSchema = z.object({ idToken: z.string().min(1) });

authRouter.post("/google", googleLoginLimiter, async (req, res) => {
  const parsed = googleLoginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(parsed.data.idToken);
  } catch {
    return res.status(401).json({ error: "Invalid Google sign-in" });
  }

  const user = await prisma.user.findUnique({ where: { googleId: identity.googleId }, include: { school: true } });
  if (!user) {
    return res.status(404).json({
      error: "No Relay account is linked to this Google account yet — sign in with your password and link Google from your Profile.",
    });
  }

  res.json(await sessionOrMfaChallenge(user));
});

const mfaLoginVerifySchema = z.object({
  tempToken: z.string().min(1),
  code: z.string().min(1),
});

// Public (no requireAuth -- there's no real session yet, only the temp
// token from /login above, passed in the body rather than a bearer
// header). Accepts either a 6-digit TOTP code or an unused backup code.
authRouter.post("/mfa/verify", mfaVerifyLimiter, async (req, res) => {
  const parsed = mfaLoginVerifySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  let payload;
  try {
    payload = verifyToken(parsed.data.tempToken);
  } catch {
    return res.status(401).json({ error: "Invalid or expired session — please log in again" });
  }
  if (!payload.mfaPending) {
    return res.status(401).json({ error: "Invalid or expired session — please log in again" });
  }

  const user = await prisma.user.findUnique({ where: { id: payload.sub }, include: { school: true } });
  if (!user || !user.totpEnabled || !user.totpSecretEncrypted) {
    return res.status(401).json({ error: "Invalid or expired session — please log in again" });
  }

  const { code } = parsed.data;
  let ok = authenticator.check(code, decrypt(user.totpSecretEncrypted));

  if (!ok) {
    // Not a valid TOTP code -- try it as a backup code instead. Each one
    // works once; bcrypt.compare against every unused hash (there are
    // only ever up to 10) rather than a direct lookup, since the codes
    // are hashed (can't be looked up by equality).
    const candidates = await prisma.mfaBackupCode.findMany({ where: { userId: user.id, usedAt: null } });
    for (const candidate of candidates) {
      if (await bcrypt.compare(code.toUpperCase(), candidate.codeHash)) {
        await prisma.mfaBackupCode.update({ where: { id: candidate.id }, data: { usedAt: new Date() } });
        ok = true;
        break;
      }
    }
  }

  if (!ok) {
    return res.status(401).json({ error: "Invalid code" });
  }

  res.json(await buildSession(user));
});

// --- Forgot / reset password -------------------------------------------
// In production (RESEND_API_KEY set), this actually emails resetUrl and
// the token never appears in the API response -- returning it alongside a
// real send would defeat the point of proving the requester owns that
// inbox. Without a configured provider (local dev/test), it's simulated:
// logged to the console, and the token comes back in the response instead
// so the UI can show a "continue to reset" link directly.
const forgotSchema = z.object({ username: z.string().min(1) });

authRouter.post("/forgot-password", forgotPasswordLimiter, async (req, res) => {
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

  const result = await issueResetToken(user, "Reset your Relay password", "You requested a password reset.");
  res.json(result);
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

  const record = await prisma.passwordResetToken.findUnique({ where: { token: hashToken(token) } });
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

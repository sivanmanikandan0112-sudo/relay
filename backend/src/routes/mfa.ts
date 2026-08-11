import { Router } from "express";
import bcrypt from "bcryptjs";
import { authenticator } from "otplib";
import QRCode from "qrcode";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { encrypt, decrypt } from "../lib/crypto.js";
import { generateBackupCodes } from "../lib/backupCodes.js";

// Self-service TOTP setup/disable -- both roles, no requireRole, same as
// GET /api/me. Mounted at /api/mfa. The actual MFA *login* step (which
// happens before a real session exists) lives in routes/auth.ts instead
// (POST /login branches, POST /mfa/verify is public) -- everything here
// requires an existing session.
export const mfaRouter = Router();

mfaRouter.use(requireAuth);

mfaRouter.get("/status", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  const backupCodesRemaining = user.totpEnabled
    ? await prisma.mfaBackupCode.count({ where: { userId: user.id, usedAt: null } })
    : 0;
  res.json({ enabled: user.totpEnabled, backupCodesRemaining });
});

// Generates a secret and leaves it "pending" -- stored (encrypted) but
// totpEnabled stays false until verify-setup confirms the user actually
// has it loaded in a real authenticator app. Re-running this before
// confirming just overwrites the previous pending secret; no separate
// cleanup needed.
mfaRouter.post("/setup", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (user.totpEnabled) {
    return res.status(400).json({ error: "Two-factor authentication is already enabled" });
  }

  const secret = authenticator.generateSecret();
  await prisma.user.update({ where: { id: user.id }, data: { totpSecretEncrypted: encrypt(secret) } });

  const otpauthUrl = authenticator.keyuri(user.email, "Relay", secret);
  const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);
  res.json({ secret, otpauthUrl, qrCodeDataUrl });
});

const verifySetupSchema = z.object({ code: z.string().min(1) });

mfaRouter.post("/verify-setup", async (req, res) => {
  const parsed = verifySetupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!user.totpSecretEncrypted) {
    return res.status(400).json({ error: "Start MFA setup first" });
  }

  const secret = decrypt(user.totpSecretEncrypted);
  if (!authenticator.check(parsed.data.code, secret)) {
    return res.status(400).json({ error: "Invalid code. Try again." });
  }

  const backupCodes = generateBackupCodes();
  await prisma.$transaction([
    prisma.mfaBackupCode.createMany({
      data: await Promise.all(backupCodes.map(async (code) => ({ userId: user.id, codeHash: await bcrypt.hash(code, 10) }))),
    }),
    prisma.user.update({ where: { id: user.id }, data: { totpEnabled: true } }),
  ]);

  // Plaintext, shown exactly once -- never retrievable again, same as a
  // freshly-generated devResetToken/create-account password elsewhere in
  // this app.
  res.json({ backupCodes });
});

const disableSchema = z.object({ password: z.string().min(1) });

mfaRouter.post("/disable", async (req, res) => {
  const parsed = disableSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    return res.status(400).json({ error: "Password is incorrect" });
  }

  await prisma.$transaction([
    prisma.mfaBackupCode.deleteMany({ where: { userId: user.id } }),
    prisma.user.update({ where: { id: user.id }, data: { totpEnabled: false, totpSecretEncrypted: null } }),
  ]);
  res.json({ disabled: true });
});

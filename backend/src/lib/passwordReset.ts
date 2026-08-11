import crypto from "node:crypto";
import { prisma } from "./prisma.js";
import { hashToken } from "./tokenHash.js";
import { emailEnabled, sendEmail } from "./email.js";
import { env } from "./env.js";

const RESET_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

interface ResetTarget {
  id: string;
  email: string;
  firstName: string;
}

/**
 * Issues a real, expiring reset token for `user` and either emails it for
 * real (production) or returns it directly in the response (dev/test) --
 * the same dual-mode behavior every other email flow in this app already
 * uses (see lib/email.ts). The token is stored hashed (lib/tokenHash.ts),
 * never raw. Shared by the self-service POST /api/auth/forgot-password
 * and the admin-initiated POST /api/admin/users/:id/reset-password --
 * `intro` is the one line that differs between "you requested this" and
 * "your administrator initiated this for you".
 */
export async function issueResetToken(user: ResetTarget, subject: string, intro: string) {
  const token = crypto.randomBytes(24).toString("hex");
  await prisma.passwordResetToken.create({
    data: { userId: user.id, token: hashToken(token), expiresAt: new Date(Date.now() + RESET_EXPIRY_MS) },
  });
  const resetUrl = `${env.frontendUrl}/reset-password?token=${token}`;

  if (emailEnabled) {
    await sendEmail({
      to: user.email,
      subject,
      html: `<p>Hi ${user.firstName},</p><p>${intro} This link expires in 30 minutes.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
    });
    return { sent: true as const };
  }

  return { sent: true as const, devResetToken: token, devNote: "No email provider configured — use this token directly." };
}

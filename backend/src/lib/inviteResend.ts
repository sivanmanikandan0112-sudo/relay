import crypto from "node:crypto";
import { prisma } from "./prisma.js";

// Same 14-day duration both invites.ts and schools.ts already use for a
// fresh invite -- kept here rather than importing from either of those
// (each still defines its own copy for their *own* create flow, on
// purpose, per their own comments: two independent invite flows that
// happen to agree on a duration). Resend is genuinely shared behavior
// between them though, so it gets its own single copy here.
const INVITE_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Rotates a pending invite onto a fresh token and pushes its expiry back
 * out to a full 14 days -- used by both "resend" routes (athlete invites
 * in routes/invites.ts, coach-to-school invites in routes/schools.ts).
 * A fresh token, not a reused one: the old link may already have been
 * opened/forwarded/leaked, and once a new one's issued for the same
 * invite there's no reason to keep the old one alive too (same "the old
 * one stops working immediately" spirit as regenerating a school's join
 * code, see lib/joinCode.ts). Callers are responsible for checking the
 * invite is actually PENDING and that the caller is allowed to act on
 * it before calling this -- this function itself does no authorization.
 */
export async function rotateInviteToken(inviteId: string) {
  return prisma.invite.update({
    where: { id: inviteId },
    data: { token: crypto.randomBytes(24).toString("hex"), expiresAt: new Date(Date.now() + INVITE_EXPIRY_MS) },
  });
}

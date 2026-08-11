import { Router } from "express";
import crypto from "node:crypto";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { emailEnabled, sendEmail } from "../lib/email.js";
import { env } from "../lib/env.js";

export const invitesRouter = Router();

const INVITE_EXPIRY_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

const SQUAD_LABEL: Record<string, string> = { GIRLS: "the girls squad", BOYS: "the boys squad" };

invitesRouter.use(requireAuth, requireRole("COACH"));

invitesRouter.get("/", async (req, res) => {
  const invites = await prisma.invite.findMany({
    where: { invitedById: req.user!.sub },
    orderBy: { createdAt: "desc" },
  });
  res.json(invites);
});

const bulkSchema = z.object({
  emails: z.array(z.string().email()).min(1).max(100),
  squadId: z.string().min(1),
});

invitesRouter.post("/bulk", async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const coachId = req.user!.sub;
  const { squadId } = parsed.data;
  const squad = await prisma.squad.findUnique({ where: { id: squadId } });
  if (!squad) return res.status(400).json({ error: "Unknown squad" });

  const coach = await prisma.user.findUniqueOrThrow({ where: { id: coachId } });
  const emails = [...new Set(parsed.data.emails.map((e) => e.trim().toLowerCase()))];

  // Skip an email if this coach already has a pending or accepted invite
  // out to it — but let them re-invite one that was rejected.
  const existing = await prisma.invite.findMany({
    where: { invitedById: coachId, email: { in: emails }, status: { in: ["PENDING", "ACCEPTED"] } },
    select: { email: true },
  });
  const skip = new Set(existing.map((e) => e.email));
  const toCreate = emails.filter((e) => !skip.has(e));

  // Individual creates, not createMany, so each new invite's token is in
  // hand right away to build its accept link for the email below.
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_MS);
  const created = await Promise.all(
    toCreate.map((email) =>
      prisma.invite.create({
        data: { email, invitedById: coachId, squadId, token: crypto.randomBytes(24).toString("hex"), expiresAt },
      })
    )
  );

  if (emailEnabled) {
    await Promise.all(
      created.map((invite) => {
        const acceptUrl = `${env.frontendUrl}/accept-invite/${invite.token}`;
        return sendEmail({
          to: invite.email,
          subject: `${coach.firstName} ${coach.lastName} invited you to Relay`,
          html: `<p>${coach.firstName} ${coach.lastName} invited you to join ${SQUAD_LABEL[squad.name] ?? "their squad"} on Relay.</p><p><a href="${acceptUrl}">${acceptUrl}</a></p><p>This link expires in 14 days.</p>`,
        });
      })
    );
  }

  const invites = await prisma.invite.findMany({
    where: { invitedById: coachId },
    orderBy: { createdAt: "desc" },
  });
  res.status(201).json({ created: toCreate.length, skipped: emails.length - toCreate.length, invites, emailSent: emailEnabled });
});

// No route to set an invite's status by hand, on purpose: PENDING ->
// ACCEPTED only ever happens as a side effect of a real signup, in
// routes/inviteAccept.ts. Status shown to a coach always reflects
// whether the invited athlete has actually created their account.

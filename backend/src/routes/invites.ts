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

// A coach can remove a PENDING invite outright -- they've decided they
// don't want to invite that person anymore, so the token stops working
// (routes/inviteAccept.ts looks the invite up by row) and the email is
// free to be re-invited later.
//
// A coach can also clear an ACCEPTED invite off this list -- once
// accepted, the Invite row is just a historical record of how that
// person joined, not a live relationship (the real roster link is
// CoachAthlete, untouched here). This is purely a "dismiss the
// notification" action: the athlete's account and roster spot are
// completely unaffected. Safe to allow re-inviting that email afterward,
// too -- if someone follows a fresh invite link for an email that
// already has an account, POST /api/invite-accept/:token 409s cleanly
// rather than letting them touch the existing account.
//
// REJECTED is deliberately left out -- rare in practice (only reachable
// today via a COACH_TO_SCHOOL invite someone declines) and not what was
// asked for; no route currently clears those.
invitesRouter.delete("/:id", async (req, res) => {
  const invite = await prisma.invite.findUnique({ where: { id: req.params.id } });
  if (!invite || invite.invitedById !== req.user!.sub) {
    return res.status(404).json({ error: "Not found" });
  }
  if (invite.status !== "PENDING" && invite.status !== "ACCEPTED") {
    return res.status(400).json({ error: "Only a pending or accepted invite can be removed" });
  }
  await prisma.invite.delete({ where: { id: invite.id } });
  res.status(204).end();
});

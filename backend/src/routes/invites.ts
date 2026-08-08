import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";

export const invitesRouter = Router();

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
});

invitesRouter.post("/bulk", async (req, res) => {
  const parsed = bulkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const coachId = req.user!.sub;
  const emails = [...new Set(parsed.data.emails.map((e) => e.trim().toLowerCase()))];

  // Skip an email if this coach already has a pending or accepted invite
  // out to it — but let them re-invite one that was rejected.
  const existing = await prisma.invite.findMany({
    where: { invitedById: coachId, email: { in: emails }, status: { in: ["PENDING", "ACCEPTED"] } },
    select: { email: true },
  });
  const skip = new Set(existing.map((e) => e.email));
  const toCreate = emails.filter((e) => !skip.has(e));

  if (toCreate.length > 0) {
    await prisma.invite.createMany({
      data: toCreate.map((email) => ({ email, invitedById: coachId })),
    });
  }

  const invites = await prisma.invite.findMany({
    where: { invitedById: coachId },
    orderBy: { createdAt: "desc" },
  });
  res.status(201).json({ created: toCreate.length, skipped: emails.length - toCreate.length, invites });
});

const statusSchema = z.object({ status: z.enum(["PENDING", "ACCEPTED", "REJECTED"]) });

// No real email flow exists for an invited athlete to respond, so this
// lets a coach flip the status manually to exercise/demo it.
invitesRouter.patch("/:id", async (req, res) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const invite = await prisma.invite.findUnique({ where: { id: req.params.id } });
  if (!invite || invite.invitedById !== req.user!.sub) {
    return res.status(404).json({ error: "Not found" });
  }
  const updated = await prisma.invite.update({
    where: { id: invite.id },
    data: { status: parsed.data.status, respondedAt: parsed.data.status === "PENDING" ? null : new Date() },
  });
  res.json(updated);
});

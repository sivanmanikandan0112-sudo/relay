import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRole } from "../middleware/requireAuth.js";
import { getOwnAthleteId } from "../lib/authz.js";
import { GENDER_TO_SQUAD } from "../lib/gender.js";
import { verifyGoogleIdToken } from "../lib/google.js";
import { pushEnabled } from "../lib/push.js";
import { DEFAULT_REMINDER_HOUR, MAX_REMINDER_HOUR, MIN_REMINDER_HOUR } from "../lib/pushReminder.js";
import { randomUnambiguousString } from "../lib/randomCode.js";

export const meRouter = Router();

meRouter.use(requireAuth);

meRouter.get("/", async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.sub }, include: { school: true } });
  if (!user) return res.status(404).json({ error: "Not found" });

  const athleteId = user.role === "ATHLETE" ? await getOwnAthleteId(user.id) : null;
  let squadId: string | null = null;
  let gender: string | null = null;
  let hasCoach = false;
  let readinessShared = false;
  if (athleteId) {
    const athlete = await prisma.athlete.findUnique({
      where: { id: athleteId },
      select: { squadId: true, gender: true, shareReadinessWithAthlete: true },
    });
    squadId = athlete?.squadId ?? null;
    gender = athlete?.gender ?? null;
    readinessShared = athlete?.shareReadinessWithAthlete ?? false;
    const coachCount = await prisma.coachAthlete.count({ where: { athleteId } });
    hasCoach = coachCount > 0;
  }

  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    name: `${user.firstName} ${user.lastName}`,
    role: user.role,
    athleteId,
    squadId,
    gender,
    hasCoach,
    readinessShared,
    schoolId: user.schoolId,
    schoolName: user.school?.name ?? null,
    isSuperAdmin: user.isSuperAdmin,
    mfaEnabled: user.totpEnabled,
    googleLinked: !!user.googleId,
    reminderHour: user.reminderHour,
  });
});

const genderSchema = z.object({
  gender: z.enum(["FEMALE", "MALE", "NONBINARY", "PREFER_NOT_TO_SAY"]),
});

// Athletes are required to specify gender at login if it isn't already set
// (see the frontend's gender gate); this is how they set it. Also moves
// them into the matching squad -- an invite's squad only reflects which
// bulk-invite the coach happened to send it from, not the athlete's own
// answer, so without this an athlete who picked "Male" could still show
// up under a coach's Girls roster just because that's who invited them.
// NONBINARY/PREFER_NOT_TO_SAY have no squad to map to (see
// lib/gender.ts's GENDER_TO_SQUAD) -- those athletes keep whichever
// squad they were invited into rather than being guessed at.
meRouter.patch("/gender", requireRole("ATHLETE"), async (req, res) => {
  const parsed = genderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const athleteId = await getOwnAthleteId(req.user!.sub);
  if (!athleteId) return res.status(403).json({ error: "No athlete profile linked to this account" });

  const squadName = GENDER_TO_SQUAD[parsed.data.gender];
  const squadId = squadName
    ? (await prisma.squad.upsert({ where: { name: squadName }, update: {}, create: { name: squadName } })).id
    : undefined;

  await prisma.athlete.update({
    where: { id: athleteId },
    data: { gender: parsed.data.gender, ...(squadId ? { squadId } : {}) },
  });
  res.json({ gender: parsed.data.gender });
});

const shareReadinessSchema = z.object({ share: z.boolean() });

// Self-service and athlete-owned -- a coach can't set this on an
// athlete's behalf, only the athlete themself, and only for their own
// profile (getOwnAthleteId, never a body-supplied athleteId). Off by
// default (see the schema comment on Athlete.shareReadinessWithAthlete);
// adjustable back and forth anytime.
meRouter.patch("/readiness-visibility", requireRole("ATHLETE"), async (req, res) => {
  const parsed = shareReadinessSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const athleteId = await getOwnAthleteId(req.user!.sub);
  if (!athleteId) return res.status(403).json({ error: "No athlete profile linked to this account" });

  await prisma.athlete.update({ where: { id: athleteId }, data: { shareReadinessWithAthlete: parsed.data.share } });
  res.json({ shared: parsed.data.share });
});

// The athlete's own current readiness, gated on their own preference --
// {shared: false} rather than a 403 when they've opted out, since this
// isn't really an authorization failure, it's just their own choice not
// to look. `latest` is the same ReadinessScore row the coach-facing
// readiness-history endpoint returns, just read through a self-scoped
// path (recomputeReadiness already writes it; no new computation here).
meRouter.get("/readiness", requireRole("ATHLETE"), async (req, res) => {
  const athleteId = await getOwnAthleteId(req.user!.sub);
  if (!athleteId) return res.status(403).json({ error: "No athlete profile linked to this account" });

  const athlete = await prisma.athlete.findUniqueOrThrow({
    where: { id: athleteId },
    select: { shareReadinessWithAthlete: true },
  });
  if (!athlete.shareReadinessWithAthlete) {
    return res.json({ shared: false, latest: null });
  }

  const latest = await prisma.readinessScore.findFirst({
    where: { athleteId },
    orderBy: [{ year: "desc" }, { week: "desc" }],
  });
  res.json({ shared: true, latest });
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8),
});

// Both roles -- no requireRole, matching GET / above. Requires the
// current password (not just being logged in) before setting a new one,
// same spirit as the athlete gender gate requiring a real answer rather
// than trusting session state alone for a sensitive change.
meRouter.patch("/password", async (req, res) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
  res.json({ changed: true });
});

const reminderHourSchema = z.object({
  hour: z.number().int().min(MIN_REMINDER_HOUR).max(MAX_REMINDER_HOUR).nullable(),
});

// Both roles, no requireRole -- same bare-requireAuth pattern as GET /
// above. For an athlete this is their own personal override; for a coach
// it's the default their athletes fall back to if they haven't set their
// own (see lib/pushReminder.ts's effectiveReminderHour) -- a coach can
// shift their whole team's reminder without every athlete individually
// opting in. `hour: null` clears it back to "use the fallback" rather
// than pinning it to today's DEFAULT_REMINDER_HOUR forever -- so a future
// change to that default still reaches anyone who never set a preference.
meRouter.patch("/reminder-hour", async (req, res) => {
  const parsed = reminderHourSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  await prisma.user.update({ where: { id: req.user!.sub }, data: { reminderHour: parsed.data.hour } });
  res.json({ reminderHour: parsed.data.hour, default: DEFAULT_REMINDER_HOUR });
});

const googleLinkSchema = z.object({ idToken: z.string().min(1) });

// Links the caller's *already-authenticated* account to a Google
// identity -- this never creates an account and never logs anyone in by
// itself (contrast with POST /api/auth/google, which does the login,
// only for an identity already linked here). Requires the Google
// token's own verified email to match this account's email, so linking
// is really just "prove you also own this Google account", not a way to
// attach someone else's Google identity to your Relay account.
meRouter.post("/google-link", async (req, res) => {
  const parsed = googleLinkSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  let identity;
  try {
    identity = await verifyGoogleIdToken(parsed.data.idToken);
  } catch {
    return res.status(401).json({ error: "Invalid Google sign-in" });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!identity.emailVerified || identity.email !== user.email.toLowerCase()) {
    return res.status(400).json({ error: "That Google account's email doesn't match your Relay account's email" });
  }

  try {
    await prisma.user.update({ where: { id: user.id }, data: { googleId: identity.googleId } });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return res.status(409).json({ error: "That Google account is already linked to a different Relay account" });
    }
    throw err;
  }
  res.json({ linked: true });
});

meRouter.delete("/google-link", async (req, res) => {
  await prisma.user.update({ where: { id: req.user!.sub }, data: { googleId: null } });
  res.json({ linked: false });
});

const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

// Both roles, no requireRole -- same bare-requireAuth pattern as GET /
// above. The Profile toggle that drives this is athlete-only today (see
// lib/pushReminder.ts's own comment on why), but the endpoint itself
// isn't the place to enforce that -- it's just "remember this device's
// subscription for this account", nothing role-specific about the act
// of subscribing.
meRouter.post("/push-subscription", async (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: "Push notifications aren't configured on this server" });
  const parsed = pushSubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }

  // Upsert on endpoint, not create -- a push subscription's endpoint is
  // a real per-device identity from the push service, so re-subscribing
  // the same device (e.g. after clearing site data, or just calling
  // subscribe() again) should replace its keys in place, not pile up
  // duplicate rows the reminder job would then double-send to.
  await prisma.pushSubscription.upsert({
    where: { endpoint: parsed.data.endpoint },
    update: { userId: req.user!.sub, p256dh: parsed.data.keys.p256dh, auth: parsed.data.keys.auth },
    create: {
      userId: req.user!.sub,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
  });
  res.json({ subscribed: true });
});

const pushUnsubscribeSchema = z.object({ endpoint: z.string().url() });

// Deletes by endpoint scoped to the caller's own userId -- so one
// account can never unsubscribe a different account's device just by
// guessing/replaying its endpoint. deleteMany (not delete) because a
// no-op unsubscribe (already gone, e.g. the reminder job already pruned
// it as "gone") should still 200, not 404 -- the end state the caller
// wants ("this endpoint isn't subscribed") is already true either way.
meRouter.delete("/push-subscription", async (req, res) => {
  const parsed = pushUnsubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  await prisma.pushSubscription.deleteMany({ where: { endpoint: parsed.data.endpoint, userId: req.user!.sub } });
  res.json({ subscribed: false });
});

// Self-service "download my data" -- everything this app has stored
// under the caller's own account, as one JSON document. See the Data &
// Privacy page (DataPolicy.tsx) for what this covers and why; this route
// is the actual implementation of the right that page describes, not
// just a description of it.
meRouter.get("/export", async (req, res) => {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  const athleteId = user.role === "ATHLETE" ? await getOwnAthleteId(user.id) : null;

  const account = {
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    accountCreatedAt: user.createdAt,
  };

  if (!athleteId) {
    // A coach's own export is much smaller -- their account fields plus
    // the notes they've personally written (the one place a coach's own
    // free-text input lives). Their roster/school membership isn't
    // "their" data in the same sense -- it's already visible to them
    // live in the app, and belongs to the athletes it's actually about.
    const notesWritten = await prisma.note.findMany({
      where: { coachId: user.id },
      select: { body: true, createdAt: true, athlete: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return res.json({
      exportedAt: new Date().toISOString(),
      account,
      notesYouWrote: notesWritten.map((n) => ({ about: n.athlete.name, body: n.body, createdAt: n.createdAt })),
    });
  }

  const [athlete, checkIns, runs, injuries, notesReceived, readinessScores] = await Promise.all([
    prisma.athlete.findUnique({
      where: { id: athleteId },
      select: { name: true, gender: true, squad: { select: { name: true } }, shareReadinessWithAthlete: true, createdAt: true },
    }),
    prisma.wellnessEntry.findMany({ where: { athleteId }, orderBy: { day: "asc" } }),
    prisma.trainingLoad.findMany({ where: { athleteId }, orderBy: { date: "asc" } }),
    prisma.injury.findMany({ where: { athleteId }, orderBy: { startDate: "asc" } }),
    prisma.note.findMany({
      where: { athleteId },
      select: { body: true, createdAt: true, coach: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "asc" },
    }),
    prisma.readinessScore.findMany({ where: { athleteId }, orderBy: [{ year: "asc" }, { week: "asc" }] }),
  ]);

  res.json({
    exportedAt: new Date().toISOString(),
    account,
    athleteProfile: athlete,
    checkIns,
    runs,
    injuries,
    coachNotes: notesReceived.map((n) => ({ from: `${n.coach.firstName} ${n.coach.lastName}`, body: n.body, createdAt: n.createdAt })),
    readinessScores,
  });
});

const deleteAccountSchema = z.object({ currentPassword: z.string().min(1) });

// Self-service "delete my account" -- anonymizes, doesn't hard-delete.
// Every identifying field on this User row (and, for an athlete, on
// their Athlete row's `name`) is scrambled to a placeholder; every row
// that actually matters for a coach's ongoing training picture -- check-
// ins, runs, readiness scores, injuries, notes -- is left exactly as it
// is, the same "history survives, identity doesn't" shape "Remove from
// roster" (DELETE /api/athletes/:id/roster) already uses for the
// roster-link half of this. Requires the current password, same as
// change-password/MFA-disable -- this is the single most destructive
// self-service action in the app, so it gets the same bar every other
// "prove you're really you right now" action already does.
//
// Deliberately still requireAuth-only, not requireRole -- both an
// athlete and a coach can delete their own account; a coach's version
// just has less athlete-specific cleanup to do.
meRouter.delete("/", async (req, res) => {
  const parsed = deleteAccountSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.flatten() });
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.sub } });
  if (!(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    return res.status(400).json({ error: "Current password is incorrect" });
  }

  // Resolved before the transaction -- a pure read with nothing else in
  // this request able to race it, and getOwnAthleteId's own shared
  // prisma client isn't the transaction's own tx handle anyway.
  const athleteId = user.role === "ATHLETE" ? await getOwnAthleteId(user.id) : null;

  const suffix = randomUnambiguousString(10);
  // A real bcrypt hash of a value nobody will ever type -- not a blank
  // or predictable string -- so this account can never be logged into
  // again by any means, not just "the old password stopped working".
  const scrambledPasswordHash = await bcrypt.hash(randomUnambiguousString(24), 10);

  await prisma.$transaction(async (tx) => {
    await tx.pushSubscription.deleteMany({ where: { userId: user.id } });
    await tx.mfaBackupCode.deleteMany({ where: { userId: user.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });

    await tx.user.update({
      where: { id: user.id },
      data: {
        username: `deleted-${suffix}`,
        email: `deleted-${suffix}@deleted.relaycoach.app`,
        firstName: "Deleted",
        lastName: user.role === "ATHLETE" ? "Athlete" : "Coach",
        passwordHash: scrambledPasswordHash,
        googleId: null,
        totpSecretEncrypted: null,
        totpEnabled: false,
        isSuperAdmin: false,
        schoolId: null,
        reminderHour: null,
      },
    });

    if (athleteId) {
      // No longer an active part of anyone's roster -- same effect as
      // "Remove from roster", just for every coach at once instead of
      // one at a time. WellnessEntry/TrainingLoad/ReadinessScore/Injury/
      // Note rows are deliberately untouched below this line.
      await tx.coachAthlete.deleteMany({ where: { athleteId } });
      await tx.athlete.update({
        where: { id: athleteId },
        data: { name: "Deleted Athlete", shareReadinessWithAthlete: false },
      });
    } else {
      // A coach's own roster links -- an athlete who loses their only
      // coach this way falls back to the existing "no coach yet" gate
      // (NoCoachNotice.tsx); one who shares a school still has every
      // other coach there via the school's own live-join visibility,
      // untouched by this.
      await tx.coachAthlete.deleteMany({ where: { coachId: user.id } });
    }
  });

  res.json({ deleted: true });
});
